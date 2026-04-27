/**
 * @Author: hqwx.com
 * @Date: 2023-12-22 18:22:12
 * @LastEditors: WRG
 * @LastEditTime: 2026-04-27 20:04:26
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
			//pull
			await git.pull('origin', this.branch)
			// 添加所有文件到暂存区
			await git.add('./*').then(() => {
				console.log('Files added!')
				// 提交
				git.commit('feat: update data with robot~').then(() => {
					console.log('Committed!')
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
