// 根据 路径 文件名 内容  写入文件到 本地 server/data 目录下
import * as fs from 'fs/promises';
import * as path from 'path';
import logger from '../utils/logger';

export async function writeToFile (relativeFilePath: string, fileName: string, content: string | Object): Promise<void> {
	try {
		const dataDir = path.join(__dirname, '../../data');
		// 拼接完整路径
		const dir = path.join(dataDir, relativeFilePath);
		const fullPath = path.join(dir, fileName);

		// 如果内容是对象，则转换为字符串
		if (typeof content === 'object') {
			content = JSON.stringify(content, null, 2);
		}

		// 检查目录是否存在，不存在才创建
		try {
			await fs.access(dir);
		} catch {
			await fs.mkdir(dir, { recursive: true });
		}

		// 检查文件是否存在，存在则追加，否则新建
		let fileHandle;
		try {
			fileHandle = await fs.open(fullPath, 'a'); // 'a' 模式用于追加内容
		} catch {
			fileHandle = await fs.open(fullPath, 'w'); // 'w' 模式用于创建新文件
		}

		await fileHandle.write(content as string);
		await fileHandle.close();
		logger.info(`文件 ${relativeFilePath} 写入成功`);
	} catch (error) {
		logger.error(`文件 ${relativeFilePath} 写入失败: ${error}`);
	}
}