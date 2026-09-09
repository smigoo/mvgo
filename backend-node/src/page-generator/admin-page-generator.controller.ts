import { Controller, Post, Body, HttpCode, HttpStatus, Res } from '@nestjs/common';
import type { Response } from 'express';
const { ZipArchive } = require('archiver');
import { AdminPageGeneratorService } from './admin-page-generator.service';
import { AdminPageConfigDto } from './dto/admin-page.dto';

@Controller('admin')
export class AdminPageGeneratorController {
  constructor(private readonly adminPageGeneratorService: AdminPageGeneratorService) {}

  @Post('generate')
  @HttpCode(HttpStatus.OK)
  generateAdminPage(@Body() config: AdminPageConfigDto) {
    try {
      const vueComponent = this.adminPageGeneratorService.generateVueComponent(config);
      const apiService = this.adminPageGeneratorService.generateApiService(config);

      return {
        success: true,
        message: '页面生成成功',
        files: {
          [`src/views/generated/${config.name}/index.vue`]: vueComponent,
          [`src/views/generated/${config.name}/api.js`]: apiService
        }
      };
    } catch (error) {
      return {
        success: false,
        message: '页面生成失败: ' + error.message,
        files: {}
      };
    }
  }

  /**
   * 生成页面并打包为 zip 直接下载
   * 复用 generate 逻辑产出 index.vue + api.js，经 archiver 流式返回 zip
   */
  @Post('download')
  @HttpCode(HttpStatus.OK)
  downloadAdminPage(@Body() config: AdminPageConfigDto, @Res() res: Response) {
    try {
      const vueComponent = this.adminPageGeneratorService.generateVueComponent(config);
      const apiService = this.adminPageGeneratorService.generateApiService(config);
      const base = `src/views/generated/${config.name}`;

      const archive = new ZipArchive({ zlib: { level: 9 } });
      archive.on('warning', (err) => {
        if (err.code !== 'ENOENT') res.destroy(err);
      });
      archive.on('error', (err) => res.destroy(err));
      archive.pipe(res);

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(config.name)}.zip"`);

      archive.append(vueComponent, { name: `${base}/index.vue` });
      archive.append(apiService, { name: `${base}/api.js` });
      archive.finalize();
    } catch (error) {
      res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: '打包失败: ' + error.message
      });
    }
  }
}