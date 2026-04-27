/*
* @Author: hp.com
* @Date: 2026-04-27 19:54:58
 * @LastEditors: WRG
 * @LastEditTime: 2026-04-27 20:51:22
 * @😍: 😃😃
 */
/**
 * @Author: hqwx.com
 * @Date: 2023-12-22 18:22:12
 * @LastEditors: WRG
 * @LastEditTime: 2026-04-27 20:56:50
 * @Description: 
 * @
*/
const cron = require('node-cron')
const simpleGit = require('simple-git')


const git = simpleGit()
let branch = 'main'
const autoPush = () => {
	try {
		// 添加远程仓库地址
		git.status().then(async (status) => {
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
//增加定时任务，每天晚上12点执行一次
cron.schedule('0 0 * * *', () => {
	console.log('Running autoPush at 12:00 AM every day')
	autoPush()
})

// module.exports = autoPush