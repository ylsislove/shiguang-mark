import {describe,it,expect} from 'vitest';
import {normalizeDate,metadataFromTags,formatDate,watermarkLines,anchor,exportName,defaults} from '../src/model';
describe('真实拍摄信息与缺失处理',()=>{
 it('不把编辑时间当成拍摄时间',()=>{expect(metadataFromTags({ModifyDate:'2026:09:27 18:00:00'}).date).toBe('');expect(metadataFromTags({}).camera).toBe('')});
 it('优先原始拍摄时间，并保留相机当地墙上时间',()=>{expect(metadataFromTags({DateTimeOriginal:'2022:02:16 09:52:07+08:00',CreateDate:'2026:09:27 18:00:00'}).date).toBe('2022-02-16T09:52:07')});
 it('校验闰日、月份和小时，支持手填日期',()=>{expect(normalizeDate('2024-02-29T09:52')).toBe('2024-02-29T09:52:00');for(const v of ['2023-02-29','2022-13-01','2022-02-01T25:00','bad'])expect(normalizeDate(v)).toBe('');expect(formatDate('2022-02-16','cn')).toBe('2022年2月16日')});
 it('正确显示南西经和赤道坐标',()=>{expect(metadataFromTags({latitude:-1.5,longitude:-2.5}).gps).toBe('1.5000°S, 2.5000°W');expect(metadataFromTags({latitude:0,longitude:0}).gps).toBe('0.0000°N, 0.0000°E');expect(metadataFromTags({latitude:999,longitude:0}).gps).toBe('')});
 it('格式化机型、焦距、光圈、曝光、ISO',()=>{const m=metadataFromTags({Make:'Canon',Model:'Canon EOS R6',FocalLength:50,FNumber:1.8,ExposureTime:1/125,ISO:100});expect(m.camera).toBe('Canon EOS R6');expect(m.params).toBe('50mm  ·  f/1.8  ·  1/125s  ·  ISO 100')});
 it('允许用户清空 EXIF 地点，缺失日期不伪造',()=>{const p={meta:metadataFromTags({DateTimeOriginal:'2022:02:16 09:52:07',City:'Chengdu'}),date:'',place:''};expect(watermarkLines(p,defaults)).toEqual([]);expect(watermarkLines(p,{...defaults,caption:'我们的旅行'})).toEqual(['我们的旅行'])});
});
describe('原图比例水印位置与批量文件名',()=>{
 it('右下锚点与 5% 边距按完整画布计算',()=>{expect(anchor(4000,3000,500,100,defaults)).toEqual({x:200,y:2750});expect(anchor(4000,3000,500,100,{...defaults,corner:'br'})).toEqual({x:3300,y:2750})});
 it('预览和原图锚点随比例等比缩放',()=>{const a=anchor(4000,3000,500,100,{...defaults,corner:'tr'}),b=anchor(1000,750,125,25,{...defaults,corner:'tr'});expect(b).toEqual({x:a.x/4,y:a.y/4})});
 it('相同名称的照片导出不冲突，路径不能逃出 ZIP',()=>{const a=exportName('../a/雪山.png',0,'image/jpeg');expect(a).not.toContain('/');expect(a.endsWith('.jpg')).toBe(true);expect(a).not.toBe(exportName('../a/雪山.png',1,'image/jpeg'))});
});
