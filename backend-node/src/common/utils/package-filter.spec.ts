import {
  EXCLUDED_PACKAGE_DIRS,
  isExcludedPackageEntry,
  packageEntryFilter,
} from './package-filter';

describe('package-filter 交付包内部目录排除', () => {
  describe('isExcludedPackageEntry', () => {
    it('排除 .snapshots 下的深路径（含生成截图）', () => {
      expect(isExcludedPackageEntry('.snapshots/initial/_upload/screenshot.png')).toBe(true);
      expect(isExcludedPackageEntry('.snapshots/initial/.checkpoint/lite-state.json')).toBe(true);
    });

    it('排除 .backups / .cache / .checkpoint / .mc-gen 顶层目录', () => {
      expect(isExcludedPackageEntry('.backups/declare.json.1789051473612.bak')).toBe(true);
      expect(isExcludedPackageEntry('.cache/figma-source.json')).toBe(true);
      expect(isExcludedPackageEntry('.checkpoint/lite-state.json')).toBe(true);
      expect(isExcludedPackageEntry('.mc-gen/cache/figma-node-data.json')).toBe(true);
    });

    it('排除 node_modules 与 .git', () => {
      expect(isExcludedPackageEntry('node_modules/vue/index.js')).toBe(true);
      expect(isExcludedPackageEntry('.git/HEAD')).toBe(true);
    });

    it('保留真实交付产物', () => {
      expect(isExcludedPackageEntry('package/index.vue')).toBe(false);
      expect(isExcludedPackageEntry('package/components/SubT.vue')).toBe(false);
      expect(isExcludedPackageEntry('resources/styles/index.less')).toBe(false);
      expect(isExcludedPackageEntry('declare.json')).toBe(false);
      expect(isExcludedPackageEntry('_figma-size.json')).toBe(false);
      expect(isExcludedPackageEntry('.preview-source.json')).toBe(false);
    });

    it('兼容反斜杠路径（Windows 形态）', () => {
      expect(isExcludedPackageEntry('.snapshots\\initial\\_upload\\screenshot.png')).toBe(true);
      expect(isExcludedPackageEntry('resources\\styles\\index.less')).toBe(false);
    });

    it('空值安全', () => {
      expect(isExcludedPackageEntry('')).toBe(false);
      expect(isExcludedPackageEntry(undefined as any)).toBe(false);
    });
  });

  describe('packageEntryFilter（archiver data 回调）', () => {
    const filter = packageEntryFilter();

    it('内部目录返回 false（丢弃）', () => {
      expect(filter({ name: '.snapshots/initial/_upload/screenshot.png' })).toBe(false);
      expect(filter({ name: '.cache/figma-source.json' })).toBe(false);
    });

    it('业务文件原样返回 entry（保留）', () => {
      const entry = { name: 'package/index.vue' };
      expect(filter(entry)).toBe(entry);
    });
  });

  it('排除清单与需求一致', () => {
    expect([...EXCLUDED_PACKAGE_DIRS].sort()).toEqual(
      ['.backups', '.cache', '.checkpoint', '.git', '.mc-gen', '.snapshots', 'node_modules'].sort(),
    );
  });
});
