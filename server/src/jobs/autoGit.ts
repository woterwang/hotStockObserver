/*
 * @Author: hp.com
 * @Date: 2026-05-12 18:14:41
 * @LastEditors: WRG
 * @LastEditTime: 2026-05-13 21:51:54
 * @😍: 😃😃
 */
import { SimpleGit, StatusResult } from 'simple-git';
import { logger } from '../utils';
const simpleGit = require('simple-git')

const git: SimpleGit = simpleGit()
let branch = 'main'
const autoPush = async () => {
	try {
		const status: StatusResult = await git.status();
		branch = status.current ?? 'main';
		logger.info(`pull 当前分支：${branch}`);
		logger.info(`Modified files: ${status.modified.join(', ') || 'none'}`);
		await git.pull('origin', branch);
		await git.add('./*');
		logger.info('Files added!');
		await git.commit('feat: update data with robot~');
		logger.info('Commit committed!');
		await git.push('origin', branch);
		logger.info(`Pushed to ${branch}!`);
	} catch (error) {
		logger.error(`autoPush 执行失败: ${(error as Error).message}`);
		throw error;
	}
}

export { autoPush }