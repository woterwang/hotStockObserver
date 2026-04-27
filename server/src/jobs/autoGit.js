/**
 * @Author: hqwx.com
 * @Date: 2023-12-22 18:22:12
 * @LastEditors: WRG
 * @LastEditTime: 2026-04-27 20:08:46
 * @Description: 
 * @
 */
const simpleGit = require('simple-git')
const git = simpleGit()
let branch = 'main'
const autoPush = () => {
	try {
		// 添加远程仓库地址
		git.status().then(async (status) => {
			this.branch = status.current
			console.log(`pull 当前分支：${ this.branch }`);
			// 打印更新日志
			const log = await git.log()
			console.log('Git log:', log)
			//pull
			await git.pull('origin', this.branch)
			// 添加所有文件到暂存区
			git.add('./*').then(() => {
				console.log('Files added!')
				// 提交
				git.commit('feat: update data with robot~').then(() => {
					console.log('Commit committed!')
					// 推送到 branch
					git.push('origin', this.branch).then(() => {
						console.log(`Pushed to ${ this.branch }!`)
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
