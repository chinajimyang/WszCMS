'use strict';
// 启动封装：自动定位数据目录。
// SQLite 数据库（library.db）与 config.json 都存放于「数据目录」，其定位优先级：
//   1. 环境变量 WZS_DATA（显式指定，始终采用）
//   2. 外接数据盘（数据迁移目标，已挂载存在时自动采用）
//   3. 回落 <项目>/data（外接盘未挂载/首次使用）
const path = require('path');
const fs = require('fs');

const APP_ROOT = path.resolve(__dirname, '..');
const EXTERNAL_DATA = '/Volumes/hd/work/WszCMS/data'; // 外接数据盘（数据迁移目标）
const DEFAULT_DATA = path.join(APP_ROOT, 'data');

function resolveDataDir() {
  if (process.env.WZS_DATA) return { dir: process.env.WZS_DATA, via: '环境变量 WZS_DATA' };
  try {
    if (fs.existsSync(EXTERNAL_DATA) && fs.statSync(EXTERNAL_DATA).isDirectory()) {
      return { dir: EXTERNAL_DATA, via: '外接数据盘已挂载' };
    }
  } catch (e) {
    /* ignore */
  }
  return { dir: DEFAULT_DATA, via: '默认目录（外接数据盘未挂载）' };
}

const { dir, via } = resolveDataDir();
process.env.WZS_DATA = dir;
console.log(`[启动] 数据目录：${dir}（${via}）`);
require('./index.js');
