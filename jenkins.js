request = require("request")

function Jenkins(url, job, authtoken) {
	this.url = url
	this.job = job
	this.token = authtoken
}

Jenkins.prototype.build = function (org, repo, pr) {
	url = encodeURI(`${this.url}/job/${this.job}/buildWithParameters?ORG=${org}&REPOSITORY=${repo}&PR=${pr}&token=${this.token}`)
	request({
		uri: url,
		method: "GET"
	}, (err, res, body) => {
		if (err) throw err;
	})
}

exports.Jenkins = Jenkins
