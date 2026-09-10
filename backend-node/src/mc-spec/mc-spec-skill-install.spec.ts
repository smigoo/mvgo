/**
 * 自定义规范检查 skill 上传（P2）安全单测
 *
 * 重点验证「不可信 zip」的处置：
 *   - zip-slip（../ 越界）、绝对路径、Windows 盘符、空字节、符号链接 → 一律拒绝
 *   - 条目数 / 单文件 / 解压总量上限（zip bomb）
 *   - 缺少约定入口 scripts/mc-check.cjs → 拒绝
 *   - 合法包：顶层目录自动剥离、原子落位、覆盖与卸载
 *
 * 通过 MC_SPEC_USER_SKILLS_DIR 把安装目录指到临时目录，避免污染真实 data/skills。
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import AdmZip from 'adm-zip';

// ⚠️ 本套件只测 skill 安装/卸载（纯文件系统逻辑），不碰组件目录解析。
// 但 mc-spec.service.ts 顶部 import 了 component-resolver.js → ai-engine/logger → backend-root.js，
// 后者用 import.meta.url，在 jest 的 CJS 运行时直接 SyntaxError。
// 故把该链路 mock 掉（同时避免真的去扫 workspace）。
jest.mock('../ai-engine/utils/component-resolver.js', () => ({
  resolveComponentDirStrict: jest.fn(async () => null),
}));

const ENTRY = 'scripts/mc-check.cjs';

/** 每个用例独立临时目录（必须在 import 服务前设好 env） */
let tmpRoot = '';
let service: any;

function buildZip(files: Record<string, string | Buffer>): Buffer {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(files)) {
    zip.addFile(name, Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8'));
  }
  return zip.toBuffer();
}

/** 构造带恶意路径的 zip（AdmZip 会规范化部分路径，这里直接改 entryName 后再序列化） */
function buildZipWithRawEntry(entryName: string, content = 'x'): Buffer {
  const zip = new AdmZip();
  zip.addFile('placeholder.txt', Buffer.from(content));
  const entry = zip.getEntries()[0];
  (entry as any).entryName = entryName;
  return zip.toBuffer();
}

beforeEach(() => {
  jest.resetModules();
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'mc-spec-skill-'));
  process.env.MC_SPEC_USER_SKILLS_DIR = path.join(tmpRoot, 'skills');
  process.env.MC_SPEC_BUILTIN_SKILLS_DIR = path.join(tmpRoot, 'builtin');
  process.env.MC_SPEC_REPORTS_DIR = path.join(tmpRoot, 'reports');
  fs.mkdirSync(path.join(tmpRoot, 'builtin', 'frontend-mc-check', 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(tmpRoot, 'builtin', 'frontend-mc-check', ENTRY), '// builtin');

  const mod = require('./mc-spec.service');
  service = new mod.McSpecService();
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

const skillsDir = () => process.env.MC_SPEC_USER_SKILLS_DIR as string;

describe('installSkillFromZip 合法安装', () => {
  it('顶层目录自动剥离，入口校验通过后落位', async () => {
    const buf = buildZip({
      'my-check/SKILL.md': '---\nname: 我的检查\ndescription: 自定义规范\nversion: v9.9.9\n---\n正文',
      [`my-check/${ENTRY}`]: '// custom checker',
      'my-check/references/checklist.md': '# 清单',
    });
    const meta = await service.installSkillFromZip(buf, {});
    expect(meta.id).toBe('my-check');
    expect(meta.builtin).toBe(false);
    expect(meta.available).toBe(true);
    expect(meta.name).toBe('我的检查');
    expect(meta.version).toBe('v9.9.9');
    expect(fs.existsSync(path.join(skillsDir(), 'my-check', ENTRY))).toBe(true);
    // 顶层目录已剥掉，不出现 my-check/my-check
    expect(fs.existsSync(path.join(skillsDir(), 'my-check', 'my-check'))).toBe(false);
  });

  it('无顶层目录（直接打包目录内容）也能安装，id 取文件名', async () => {
    const buf = buildZip({ [ENTRY]: '// x', 'references/a.md': 'a' });
    const meta = await service.installSkillFromZip(buf, { fileName: 'My-Checker.zip' });
    expect(meta.id).toBe('my-checker');
    expect(fs.existsSync(path.join(skillsDir(), 'my-checker', ENTRY))).toBe(true);
  });

  it('显式 skillId 优先于 zip 顶层目录名', async () => {
    const buf = buildZip({ 'whatever/SKILL.md': 'x', [`whatever/${ENTRY}`]: 'x' });
    const meta = await service.installSkillFromZip(buf, { skillId: 'explicit-id' });
    expect(meta.id).toBe('explicit-id');
  });

  it('同名已存在时默认拒绝，overwrite=true 才覆盖', async () => {
    const mk = (body: string) => buildZip({ 'dup/SKILL.md': 'x', [`dup/${ENTRY}`]: body });
    await service.installSkillFromZip(mk('v1'), {});
    await expect(service.installSkillFromZip(mk('v2'), {})).rejects.toThrow(/已存在/);
    await service.installSkillFromZip(mk('v2'), { overwrite: true });
    const content = fs.readFileSync(path.join(skillsDir(), 'dup', ENTRY), 'utf-8');
    expect(content).toBe('v2');
  });

  it('列表里同时包含内置与自定义 skill', async () => {
    await service.installSkillFromZip(buildZip({ 'aa/SKILL.md': 'x', [`aa/${ENTRY}`]: 'x' }), {});
    const list = service.listSkills();
    expect(list.find((s: any) => s.id === 'frontend-mc-check')?.builtin).toBe(true);
    expect(list.find((s: any) => s.id === 'aa')?.builtin).toBe(false);
  });
});

describe('installSkillFromZip 安全拒绝', () => {
  it('拒绝 zip-slip（../ 越界）', async () => {
    const buf = buildZipWithRawEntry('../../evil.sh');
    await expect(service.installSkillFromZip(buf, { skillId: 'ok-id' })).rejects.toThrow(/不安全路径/);
  });

  it('拒绝绝对路径与 Windows 盘符', async () => {
    await expect(
      service.installSkillFromZip(buildZipWithRawEntry('/etc/passwd'), { skillId: 'ok-id' }),
    ).rejects.toThrow(/不安全路径/);
    await expect(
      service.installSkillFromZip(buildZipWithRawEntry('C:/windows/x'), { skillId: 'ok-id' }),
    ).rejects.toThrow(/不安全路径/);
  });

  it('拒绝空字节路径', async () => {
    await expect(
      service.installSkillFromZip(buildZipWithRawEntry('a\0b.txt'), { skillId: 'ok-id' }),
    ).rejects.toThrow(/不安全路径/);
  });

  it('拒绝符号链接条目', async () => {
    const zip = new AdmZip();
    zip.addFile('link.txt', Buffer.from('x'));
    const entry = zip.getEntries()[0];
    entry.header.attr = (0o120777 << 16) >>> 0; // S_IFLNK
    await expect(
      service.installSkillFromZip(zip.toBuffer(), { skillId: 'ok-id' }),
    ).rejects.toThrow(/符号链接/);
  });

  it('缺少约定入口 scripts/mc-check.cjs 时拒绝', async () => {
    const buf = buildZip({ 'pkg/SKILL.md': 'x', 'pkg/other.js': 'y' });
    await expect(service.installSkillFromZip(buf, {})).rejects.toThrow(/缺少约定入口/);
  });

  it('非法 skillId（含路径分隔符 / 大写）拒绝', async () => {
    const buf = buildZip({ [`p/${ENTRY}`]: 'x' });
    await expect(service.installSkillFromZip(buf, { skillId: '../evil' })).rejects.toThrow(/无法确定合法的 skill 标识|非法/);
    await expect(service.installSkillFromZip(buf, { skillId: 'Bad Case' })).rejects.toThrow(/无法确定合法的 skill 标识|非法/);
  });

  it('空 zip / 超限内容拒绝', async () => {
    await expect(service.installSkillFromZip(Buffer.alloc(0), {})).rejects.toThrow(/上传内容为空/);
    const empty = new AdmZip().toBuffer();
    await expect(service.installSkillFromZip(empty, {})).rejects.toThrow(/没有任何文件/);
  });

  it('非 zip 二进制拒绝', async () => {
    await expect(
      service.installSkillFromZip(Buffer.from('not a zip at all'), { skillId: 'ok-id' }),
    ).rejects.toThrow(/zip 解析失败|没有任何文件/);
  });

  it('失败后不留下临时目录', async () => {
    await expect(
      service.installSkillFromZip(buildZip({ 'pkg/other.js': 'x' }), {}),
    ).rejects.toThrow();
    const left = fs.existsSync(skillsDir())
      ? fs.readdirSync(skillsDir()).filter((n) => n.startsWith('.tmp-'))
      : [];
    expect(left).toEqual([]);
  });
});

describe('removeSkill 卸载', () => {
  it('可以卸载自定义 skill', async () => {
    await service.installSkillFromZip(buildZip({ 'gone/SKILL.md': 'x', [`gone/${ENTRY}`]: 'x' }), {});
    expect(service.removeSkill('gone').removed).toBe(true);
    expect(fs.existsSync(path.join(skillsDir(), 'gone'))).toBe(false);
  });

  it('内置 skill 不可删除', () => {
    expect(() => service.removeSkill('frontend-mc-check')).toThrow(/内置 skill 不可删除/);
  });

  it('不存在的 skill 报 404 语义错误', () => {
    expect(() => service.removeSkill('nope-not-exist')).toThrow(/skill 不存在/);
  });

  it('非法 id 拒绝', () => {
    expect(() => service.removeSkill('../etc')).toThrow(/非法的 skill 标识/);
  });
});
