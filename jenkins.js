var request = require("request")
var logger  = require("logger").createLogger('development.log');
var fs      = require("fs")

function Jenkins(url, job, authtoken, fallback_url, username, password) {
	this.url = url
	this.job = job
	this.token = authtoken
	this.fallback_url = fallback_url
	this.auth = "Basic " + new Buffer(username + ":" + password).toString("base64");
}

Jenkins.prototype.build = function (org, repo, pr) {
	url = encodeURI(`${this.url}/job/${this.job}/buildWithParameters?ORG=${org}&REPOSITORY=${repo}&PR=${pr}&FALLBACKURL=${this.fallback_url}&token=${this.token}`)
	request({
		uri: url,
		method: "GET",
		headers: {
			"Authorization": this.auth
		}
	}, (err, res, body) => {
		if (err) throw err;
		fs.writeFileSync(__dirname + `/reports/${repo}/${pr}/qid`, res.headers.location)
	})
}

Jenkins.prototype.abort = function (repo, pr) {
	url = fs.readFileSync(__dirname + `/reports/${repo}/${pr}/qid`) + "api/json"
	request({
		uri: url,
		method: "GET",
		headers: {
			"Authorization": this.auth
		}
	}, (err, res, body) => {
		if (err) throw err;
		console.log(body)
		json = JSON.parse(body);
		request({
			uri: json.executable.url + `stop?token=${this.token}`,
			method: "POST",
			headers: {
				"Authorization": this.auth
			}
		}, (err2, res2, body2) => {
			if (err2) throw err2;
			console.log(body2)
		})
	})
}

exports.Jenkins = Jenkins
