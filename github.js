var request = require("request")
var logger  = require("logger").createLogger('development.log');

function GitHub(agent, client_id, client_secret, comment_token) {
	this.agent = agent
	this.client_id = client_id
	this.client_secret = client_secret
	this.comment_token = comment_token
}

GitHub.prototype.getPR = function (org, repo, pr, cb) {
	request({
		headers: {
			"User-Agent": this.agent
		},
		uri: `https://api.github.com/repos/${org}/${repo}/pulls/${pr}?client_id=${this.client_id}&client_secret=${this.client_secret}`,
		method: "GET"
	}, (err, res, body) => {
		cb(err, JSON.parse(body))
	})
}

GitHub.prototype.getCommits = function (org, repo, pr, cb) {
	request({
		headers: {
			"User-Agent": this.agent
		},
		uri: `https://api.github.com/repos/${org}/${repo}/pulls/${pr}/commits?client_id=${this.client_id}&client_secret=${this.client_secret}`,
		method: "GET"
	}, (err, res, body) => {
		cb(err, JSON.parse(body))
	})
}

GitHub.prototype.getOpenPulls = function(org, repo, cb) {
	request({
		headers: {
			"User-Agent": this.agent
		},
		uri: `https://api.github.com/repos/${org}/${repo}/pulls?client_id=${this.client_id}&client_secret=${this.client_secret}&state=opened`,
		method: "GET"
	}, (err, res, body) => {
		cb(err, JSON.parse(body))
	})
}

GitHub.prototype.makeComment = function(comment, org, repo, issue) {
	request({
		headers: {
			"User-Agent": this.agent,
			"Authorization": `token ${this.comment_token}`
		},
		method: "POST",
		uri: `https://api.github.com/repos/${org}/${repo}/issues/${issue}/comments?client_id=${this.client_id}&client_secret=${this.client_secret}`,
		body: `{ "body": "${comment}" }`
	}, (err, res, body) => {
		if (err) throw err
		if (JSON.parse(body).body !== comment)
			logger.error("Problem making comment on GitHub")
	})
}

exports.GitHub = GitHub
