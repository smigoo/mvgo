import { Controller, Get, Post, Delete, Body, Param, Query } from '@nestjs/common';
import { RecipesService } from './recipes.service';

@Controller('recipes')
export class RecipesController {
  constructor(private readonly recipesService: RecipesService) {}

  /** 配方列表（内置 + 用户，精简视图） */
  @Get()
  list() {
    return this.recipesService.list();
  }

  /** 配方详情（含完整拓扑，供"使用"加载到画布） */
  @Get(':name')
  get(@Param('name') name: string) {
    return this.recipesService.get(name);
  }

  /** 另存为模板：从当前管线保存为用户配方 */
  @Post('save')
  save(@Body() dto: any, @Query('userId') userId?: string) {
    return this.recipesService.saveRecipe(dto, userId);
  }

  /** 删除用户配方（内置不可删） */
  @Post(':name/delete')
  remove(@Param('name') name: string, @Query('userId') userId?: string) {
    return this.recipesService.remove(name, userId);
  }
}
