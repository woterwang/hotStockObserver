/*
 * @Author: hp.com
 * @Date: 2026-04-27 19:54:58
 * @LastEditors: WRG
 * @LastEditTime: 2026-04-27 20:21:15
 * @😍: 😃😃
 */
/**
 * @Author: hqwx.com
 * @Date: 2023-12-22 18:22:12
 * @LastEditors: WRG
 * @LastEditTime: 2026-04-27 20:13:59
 * @Description: 
 * @
 */
const simpleGit = require('simple-git')

interface StatusResult {
  current: string;      // 当前分支
  modified: string[];   // 修改的文件
  not_added: string[];  // 未添加的文件
  conflicted: string[]; // 冲突文件
  created: string[];    // 新建文件
  deleted: string[];    // 删除文件
  renamed: string[];    // 重命名文件
}

const git = simpleGit()
let branch = 'main'
const autoPush = () => {
	try {
		// 添加远程仓库地址
		git.status().then(async (status: StatusResult) => {
			branch = status.current
			console.log(`pull 当前分支：${ branch }`);
			// 打印本地修改的文件列表
			console.log('Modified files:', status.modified)
			//pull
			await git.pull('origin', branch)
			// 添加所有文件到暂存区
			git.add('./*').then(() => {
				console.log('Files added!')
				// 提交
				git.commit('feat: update data with robot~').then(() => {
					console.log('Commit committed!')
					// 推送到 branch
					git.push('origin', branch).then(() => {
						console.log(`Pushed to ${ branch }!`)
					})
				})
			})
		})
	} catch (error) {
		console.log(error)
	}
}
autoPush()
module.exports = autoPush