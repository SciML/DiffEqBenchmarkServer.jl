var request = require("request")

function GitHub(agent, client_id, client_secret, comment_token, reports_repo) {
	this.agent = agent
	this.client_id = client_id
	this.client_secret = client_secret
	this.comment_token = comment_token
	this.reports_repo = reports_repo
}
/* Function to get PR data and pass it to callback `cb` */
GitHub.prototype.getPR = function (org, repo, pr, cb) {
	request({
		headers: {
			"User-Agent": this.agent.github_handle
		},
		uri: `https://api.github.com/repos/${org}/${repo}/pulls/${pr}?client_id=${this.client_id}&client_secret=${this.client_secret}`,
		method: "GET"
	}, (err, res, body) => {
		cb(err, JSON.parse(body))
	})
}
/* Get all commits of a PR and pass it to callback `cb`*/
GitHub.prototype.getCommits = function (org, repo, pr, cb) {
	request({
		headers: {
			"User-Agent": this.agent.github_handle
		},
		uri: `https://api.github.com/repos/${org}/${repo}/pulls/${pr}/commits?client_id=${this.client_id}&client_secret=${this.client_secret}`,
		method: "GET"
	}, (err, res, body) => {
		cb(err, JSON.parse(body))
	})
}

/* Get all open PRs for a repository and pass it to callback `cb`*/
GitHub.prototype.getOpenPulls = function(org, repo, cb) {
	request({
		headers: {
			"User-Agent": this.agent.github_handle
		},
		uri: `https://api.github.com/repos/${org}/${repo}/pulls?client_id=${this.client_id}&client_secret=${this.client_secret}&state=opened`,
		method: "GET"
	}, (err, res, body) => {
		cb(err, JSON.parse(body))
	})
}

/* Make a comment by the name of Bot on a particular PR */
GitHub.prototype.makeComment = function(comment, org, repo, issue) {
	request({
		headers: {
			"User-Agent": this.agent.github_handle,
			"Authorization": `token ${this.comment_token}`
		},
		method: "POST",
		uri: `https://api.github.com/repos/${org}/${repo}/issues/${issue}/comments?client_id=${this.client_id}&client_secret=${this.client_secret}`,
		body: `{ "body": "${comment}" }`
	}, (err, res, body) => {
		if (err) throw err
		if (JSON.parse(body).body !== comment)
			console.log("Problem making comment on GitHub")
	})
}

/* Make a file with complete path `filename` and content `content` on a particular repository */
GitHub.prototype.commitFileToMaster = function(filename, content, org, repo, cb) {
	this.getMasterCommit(org, repo, (master_commit) => {
		this.getTreeFromCommit(org, repo, master_commit, (tree) => {
			this.createTreeFromBaseAndFile(org, repo, tree, filename, content, (new_tree) => {
				this.makeCommit(org, repo, `Add ${filename}`, new_tree, master_commit, (new_commit) => {
					this.updateMasterRef(org, repo, new_commit, (status) => {
						cb()
					})
				})
			})
		})
	})
}
/* Get latest commit on master */
GitHub.prototype.getMasterCommit = function(org, repo, cb) {
	request({
		headers: {
			"User-Agent": this.agent.github_handle,
			"Authorization": `token ${this.comment_token}`
		},
		method: "GET",
		uri: `https://api.github.com/repos/${org}/${repo}/git/refs/heads/master`
	}, (err, res, body) => {
		if(err) throw err;
		cb(JSON.parse(body).object.sha)
	})
}

/* Helper function for `commitFileToMaster` */
GitHub.prototype.getTreeFromCommit = function(org, repo, commit, cb) {
	request({
		headers: {
			"User-Agent": this.agent.github_handle,
			"Authorization": `token ${this.comment_token}`
		},
		method: "GET",
		uri: `https://api.github.com/repos/${org}/${repo}/git/commits/${commit}`
	}, (err, res, body) => {
		if (err) throw err;
		cb(JSON.parse(body).tree.sha)
	})
}

/* Helper function for `commitFileToMaster` */
GitHub.prototype.makeBlob = function(content, org, repo, cb) {
	request({
		headers: {
			"User-Agent": this.agent.github_handle,
			"Authorization": `token ${this.comment_token}`
		},
		method: "POST",
		uri: `https://api.github.com/repos/${org}/${repo}/git/blobs`,
		body: JSON.stringify({ content: content, encoding: "utf-8" })
	}, (err, res, body) => {
		if (err) throw err;
		cb(JSON.parse(body).sha);
	})
}

/* Helper function for `commitFileToMaster` */
GitHub.prototype.createTreeFromBaseAndFile = function(org, repo, base, filename, content, cb) {
	body = JSON.stringify({
		base_tree: base,
		tree: [
			{
				path: filename,
				mode: "100644",
				type: "blob",
				content: content
			}
		]
	})
	request({
		headers: {
			"User-Agent": this.agent.github_handle,
			"Authorization": `token ${this.comment_token}`
		},
		method: "POST",
		uri: `https://api.github.com/repos/${org}/${repo}/git/trees`,
		body: body
	}, (err, res,body) => {
		if (err) throw err;
		cb(JSON.parse(body).sha)
	})
}

/* Helper function for `commitFileToMaster` */
GitHub.prototype.makeCommit = function(org, repo, message, new_tree, master_commit, cb) {
	date = new Date();
	body = JSON.stringify(
	{
		message: message,
		author: {
			name: this.agent.name,
			email: this.agent.email,
			date: date.toISOString()
		},
		tree: new_tree,
		parents: [master_commit]
	})

	request({
		headers: {
			"User-Agent": this.agent.github_handle,
			"Authorization": `token ${this.comment_token}`
		},
		method: "POST",
		uri: `https://api.github.com/repos/${org}/${repo}/git/commits`,
		body : body
	}, (err, res, body) => {
		if (err) throw err;
		cb(JSON.parse(body).sha)
	})
}

/* Helper function for `commitFileToMaster` */
GitHub.prototype.updateMasterRef = function(org, repo, new_commit, cb) {
	request({
		headers: {
			"User-Agent": this.agent.github_handle,
			"Authorization": `token ${this.comment_token}`
		},
		method: "PATCH",
		uri: `https://api.github.com/repos/${org}/${repo}/git/refs/heads/master`,
		body: JSON.stringify({sha: new_commit, force: false})
	}, (err, res, body) => {
		cb(true)
	})
}

/* Parse report json to markdown */
GitHub.prototype.generate_markdown = function(report, stamp) {
	items = report.items
	res = `# Performance report for pull request #${report.pr} \n\n Generated at: ${stamp}\n\n`
	for (var i = 0; i < items.length; i++) {
		item = items[i]
		if (item.type === "table") {
			res += `## ${item.title}\n\n`
			head = ""
			foot = ""
			for(var j = 0; j < item.data.head.length; j++) {
				if (j != 0) {
					head += "|"
					foot += "|"
				}
				head += ` ${item.data.head[j]} `
				foot += " --- "
			}

			res += head + '\n'
			res += foot + '\n'

			for (var j = 0; j < item.data.table.length; j++) {
				row = item.data.table[j]
				rowstr = ''
				for(var k = 0; k < row.length; k++) {
					if(k != 0) {
						rowstr += "|"
					}
					rowstr += ` ${row[k]} `
				}
				rowstr += '\n'
				res += rowstr
			}

			res += '\n\n'
		}
		else if(item.type == "image") {
			res += `#### Diagram - ${item.title}\n\n`
			res += `![](${item.data})\n\n`
		}
	}
	return res;
}

/* Post report to Reports repository and pass `filename` to callback `cb` */
GitHub.prototype.generate_report = function(report, cb) {
	time = new Date()
	filename = time.getTime()
	stamp = time.toISOString()
	markdown = this.generate_markdown(report, stamp)
	reports_org = this.reports_repo.split("/")[0]
	reports_repo = this.reports_repo.split("/")[1]
	this.commitFileToMaster(`${report.repo}/${report.pr}/${report.commit}/${filename}.md`,
		markdown,
		reports_org, reports_repo, () => {
			cb(filename)
		})
}

exports.GitHub = GitHub
