import { SimpleGit, StatusResult } from 'simple-git';
const simpleGit = require('simple-git')

const git: SimpleGit = simpleGit()
let branch = 'main'
const autoPush = () => {
	try {
		// 添加远程仓库地址
		git.status().then(async (status: StatusResult) => {
			branch = status.current ?? 'main';
			console.log(`pull 当前分支：${branch}`);
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
						console.log(`Pushed to ${branch}!`)
					})
				})
			})
		})
	} catch (error) {
		console.log(error)
	}
}

module.exports = autoPush

export { autoPush }