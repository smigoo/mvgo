package com.mvgo.business.util;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/**
 * 密码工具（PBKDF2WithHmacSHA256，Java 标准库内置）.
 *
 * <p>使用 {java-pbkdf2} 前缀区分 Node bcrypt 哈希，两者互不冲突.
 */
public final class PasswordUtil {

    private static final String PREFIX = "{java-pbkdf2}";
    private static final String ALGORITHM = "PBKDF2WithHmacSHA256";
    private static final int ITERATIONS = 10000;
    private static final int KEY_LENGTH = 256;
    private static final int SALT_BYTES = 16;

    private PasswordUtil() {}

    public static String hash(String password) throws Exception {
        byte[] salt = new byte[SALT_BYTES];
        new SecureRandom().nextBytes(salt);
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, ITERATIONS, KEY_LENGTH);
        byte[] hash = SecretKeyFactory.getInstance(ALGORITHM).generateSecret(spec).getEncoded();
        return PREFIX + Base64.getEncoder().encodeToString(salt) + ":"
                + Base64.getEncoder().encodeToString(hash);
    }

    public static boolean verify(String password, String stored) {
        if (stored == null || !stored.startsWith(PREFIX)) return false;
        try {
            String[] parts = stored.substring(PREFIX.length()).split(":", 2);
            byte[] salt = Base64.getDecoder().decode(parts[0]);
            byte[] expected = Base64.getDecoder().decode(parts[1]);
            PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, ITERATIONS, KEY_LENGTH);
            byte[] actual = SecretKeyFactory.getInstance(ALGORITHM).generateSecret(spec).getEncoded();
            return MessageDigest.isEqual(expected, actual);
        } catch (Exception e) {
            return false;
        }
    }
}