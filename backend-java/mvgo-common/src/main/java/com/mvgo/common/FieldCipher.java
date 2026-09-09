package com.mvgo.common;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.regex.Pattern;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/**
 * 字段级对称加解密工具（AES-256-GCM），密文格式与 Node
 * {@code src/common/crypto/field-encryption.ts} 互通。
 *
 * <p>用于读取 Node 侧落库的加密字段（UserAiConfig.configEnc 等）。
 * 密文格式：{@code base64(iv) . base64(authTag) . base64(ciphertext)}，iv 12 字节、tag 16 字节。
 *
 * <p>密钥派生与 Node 完全一致（三选一）：
 * <ol>
 *   <li>64 位 hex（32 字节）→ hex 解码；</li>
 *   <li>43~44 位 base64（32 字节）→ base64 解码（缺 padding 自动补齐）；</li>
 *   <li>其余任意串 → sha256(raw) 补齐 32 字节。</li>
 * </ol>
 *
 * <p>密钥来源：环境变量 {@code FIELD_ENCRYPTION_KEY}（生产必填，与 Node 同 key）。
 * 未配置时退化为开发派生密钥 {@code sha256("dev-field-encryption-key")}（与 Node 非生产行为一致），
 * 生产务必注入真实 key，否则解密必然失败（GCM 认证不过）——{@link #decrypt} 对任何异常
 * 均返回 {@code null}，不会向上抛出拖垮服务。
 *
 * @since 1.0.0
 */
public class FieldCipher {

    /** 与 Node field-encryption.ts 的开发兜底密钥保持一致 */
    public static final String DEV_FALLBACK_KEY = "dev-field-encryption-key";

    private static final Pattern HEX64 = Pattern.compile("^[0-9a-fA-F]{64}$");
    private static final Pattern B64_32 = Pattern.compile("^[A-Za-z0-9+/]{43}={0,2}$");

    private final SecretKeySpec key;

    public FieldCipher(String rawKey) {
        byte[] k = deriveKey(rawKey == null || rawKey.isBlank() ? DEV_FALLBACK_KEY : rawKey);
        this.key = new SecretKeySpec(k, "AES");
    }

    /**
     * 解密 AES-256-GCM 密文。
     *
     * @param payload {@code base64(iv).base64(tag).base64(ciphertext)}；null/空/格式非法/解密失败均返回 null
     * @return 明文字符串，失败返回 null
     */
    public String decrypt(String payload) {
        if (payload == null || payload.isEmpty()) {
            return null;
        }
        String[] parts = payload.split("\\.");
        if (parts.length != 3) {
            return null;
        }
        try {
            byte[] iv = Base64.getDecoder().decode(parts[0]);
            byte[] tag = Base64.getDecoder().decode(parts[1]);
            byte[] data = Base64.getDecoder().decode(parts[2]);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(128, iv));
            byte[] plain = cipher.doFinal(concat(data, tag));
            return new String(plain, StandardCharsets.UTF_8);
        } catch (Exception e) {
            // GCM 认证失败 / 密钥不匹配 / 数据损坏：一律视为不可解密，由调用方降级（与 Node schema 解密失败返回 {} 一致）
            return null;
        }
    }

    private static byte[] deriveKey(String raw) {
        if (HEX64.matcher(raw).matches()) {
            return hexDecode(raw);
        }
        if (B64_32.matcher(raw).matches()) {
            return base64Decode32(raw);
        }
        return sha256(raw);
    }

    private static byte[] hexDecode(String hex) {
        byte[] out = new byte[hex.length() / 2];
        for (int i = 0; i < out.length; i++) {
            out[i] = (byte) Integer.parseInt(hex.substring(i * 2, i * 2 + 2), 16);
        }
        return out;
    }

    private static byte[] base64Decode32(String b64) {
        StringBuilder sb = new StringBuilder(b64.trim());
        while (sb.length() % 4 != 0) {
            sb.append('=');
        }
        return Base64.getDecoder().decode(sb.toString());
    }

    private static byte[] sha256(String raw) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(raw.getBytes(StandardCharsets.UTF_8));
        } catch (Exception e) {
            throw new IllegalStateException("SHA-256 不可用", e);
        }
    }

    private static byte[] concat(byte[] a, byte[] b) {
        byte[] out = new byte[a.length + b.length];
        System.arraycopy(a, 0, out, 0, a.length);
        System.arraycopy(b, 0, out, a.length, b.length);
        return out;
    }
}
