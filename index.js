var express = require("express");
var logger  = require("logger").createLogger('development.log');
var fs      = require("fs");
var request = require("request")
var utils   = require("./utils");

/* MIDDLEWARES */
var app = express()
app.use(express.urlencoded());
app.use(express.json());
app.use(express.static('public'))
app.set('view engine', 'ejs');

/* BOOTSTRAP */
!fs.existsSync(__dirname + `/reports`) && fs.mkdirSync(__dirname + `/reports`);
config = JSON.parse(fs.readFileSync(__dirname + "/config.json"))

/* MONGO SETUP */
const MongoClient = require('mongodb').MongoClient;
const uri = config.db_url;
let db;
MongoClient.connect(uri, { useNewUrlParser: true }, function(err, client) {
	if (err) throw err;
	db = client.db("main");
});

/* PUBLIC ROUTES */
app.get("/", (req, res) => {
	res.render("index", {registered_repos: config.registered_repos, org: config.org, repo: ""})
});

app.get("/packages/:repo", (req, res) => {
	if (config.registered_repos.includes(req.params.repo))
		res.render("repo", {registered_repos: config.registered_repos, org: config.org, repo: req.params.repo});
	else
		res.status(404).render("404", {registered_repos: config.registered_repos, org: config.org})
})

app.get("/packages/:repo/:pr", (req, res) => {
	if (config.registered_repos.includes(req.params.repo))
		res.render("pr", {registered_repos: config.registered_repos, org: config.org, repo: req.params.repo, pr: req.params.pr})
	else
		res.status(404).render("404", {registered_repos: config.registered_repos, org: config.org})
})

app.get("/packages/:repo/:pr/:commit", (req, res) => {
	if (config.registered_repos.includes(req.params.repo))
		res.render("build", {registered_repos: config.registered_repos, org: config.org, repo: req.params.repo, pr: req.params.pr, commit: req.params.commit})
	else
		res.status(404).render("404", {registered_repos: config.registered_repos, org: config.org})
}) 

/* API */

app.get("/api/pr/:repo/:pr", (req,res) => {
	if (!config.registered_repos.includes(req.params.repo)){
		res.status(404).send("not found");
		return;
	}

	request({
		headers: {
			"User-Agent": config.admin
		},
		uri: `https://api.github.com/repos/${config.org}/${req.params.repo}/pulls/${req.params.pr}?client_id=${config.github_outh_client_id}&client_secret=${config.github_outh_client_secret}`,
		method: "GET"
	}, (err, res2, body) => {
		if (err) {
			res.status(500).send("Internal Error");
		}
		else {
			json = JSON.parse(body)
			res.json({number: json.number, author: json.user.login, title: json.title})
		}
	})
})

app.get("/api/commits/:repo/:pr/", (req,res) => {
	if (!config.registered_repos.includes(req.params.repo)){
		res.status(404).send("not found");
		return;
	}

	request({
		headers: {
			"User-Agent": config.admin
		},
		uri: `https://api.github.com/repos/${config.org}/${req.params.repo}/pulls/${req.params.pr}/commits?client_id=${config.github_outh_client_id}&client_secret=${config.github_outh_client_secret}`,
		method: "GET"
	}, (err, res2, body) => {
		if (err) {
			res.status(500).send("Internal Error");
		}
		else {
			json = JSON.parse(body)
			res_json = []
			json.forEach((commit) => {
				res_json.push({sha: commit.sha, message: commit.commit.message})
			})
			res.json(res_json)
		}
	})
})

app.get("/api/builds/:repo/:pr", (req, res) => {
	if (!config.registered_repos.includes(req.params.repo)){
		res.status(404).send("not found");
		return;
	}

	if (!fs.existsSync(__dirname + `/reports/${req.params.repo}`)) {
		res.json({ builds: [], latest: "" })
		return;
	}
	if (!fs.existsSync(__dirname + `/reports/${req.params.repo}/${req.params.pr}`)) {
		res.json({ builds: [], latest: "" })
		return;
	}
	q = {"repo": req.params.repo, "pull": parseInt(req.params.pr)}
	db.collection("pulls").findOne(q, (err, result) => {
		if (err) throw err;
		builds = fs.readdirSync(__dirname + `/reports/${req.params.repo}/${req.params.pr}`)
		for (var i = builds.length - 1; i >= 0; i--) {
			builds[i] = builds[i].substr(0, builds[i].length-5) // Removing `.json`
		}
		if (result)
			latest = result.latest
		else
			latest = ""
		res.json({builds, latest})
	})
})

app.get("/api/build/:repo/:pr/:commit", (req, res) => {
	if (!config.registered_repos.includes(req.params.repo)){
		res.status(404).send("not found");
		return;
	}

	if(fs.existsSync(__dirname + `/reports/${req.params.repo}/${req.params.pr}/${req.params.commit}.json`))
		res.sendFile(__dirname + `/reports/${req.params.repo}/${req.params.pr}/${req.params.commit}.json`)
	else
		res.status(404).send("not found");
})

app.get("/api/repo_open_pulls/:repo", (req, res) => {
	if (!config.registered_repos.includes(req.params.repo)){
		res.status(404).send("not found");
		return;
	}

	request({
		headers: {
			"User-Agent": config.admin
		},
		uri: `https://api.github.com/repos/${config.org}/${req.params.repo}/pulls?client_id=${config.github_outh_client_id}&client_secret=${config.github_outh_client_secret}&state=opened`,
		method: "GET"
	}, (err, res2, body) => {
		if (err) {
			res.status(500).send("Internal Error");
		}
		else {
			data = []
			open_prs = JSON.parse(body)
			if(!(open_prs instanceof Array)) {
				res.status(500).send("Internal Error");
				return;
			}
			open_prs.forEach((pr) => {
				obj = { title: pr.title, number: pr.number, author: pr.user.login }
				data.push(obj);
			})
			res.json(data);
		}
	})
})

app.post("/api/report", (req, res) => {
	key = req.body.key;
	if (key !== config.jenkins_secret) {
		res.status(401).send("not authorized");
		return;
	}

	report = req.body.report;
	if (!config.registered_repos.includes(report.repo)){
		res.status(404).send("not found");
		return;
	}

	/* Generate a static report */
	utils.generate_report(report, db, (success) => {
		if (success) {
			logger.info(`Performance report generated for ${report.repo}#${report.pr}(${report.commit})`)
		}
		else {
			logger.error(`Error generating report for ${report.repo}#${report.pr}(${report.commit})`)
			res.send("error");
			return;
		}
	});

	res.send("ok");
});

/* BOT ENDPOINT */

app.post(`/bot/${config.bot_secret}`, (req, res) => {
	json = req.body;
	if (json.action === "created"             &&
		json.issue !== undefined              &&
		json.comment !== undefined            &&
		json.issue.pull_request !== undefined
		) {
		comment = json.comment.body.trim()
		idx = comment.indexOf(`@${config.bot_name}`)
		if (idx == -1) {
			res.send("ok")
			return;
		}
		if (json.repository.owner.login !== config.org || !config.registered_repos.includes(json.repository.name)) {
			/* TODO: Send a comment that this repo is not authorized/registered */
			github_comment(`Sorry, but this repository is not registered to work with me. cc @${config.admin}`, json.repository.name, json.issue.number)
			res.send("ok")
			return;
		}
		if (!config.benchmarkers.includes(json.comment.user.login)) {
			/* TODO: send a comment that you cant do that */
			github_comment(`Sorry, but you cannot do that, instead you can ask @${config.admin} to run benchmarks.`, json.repository.name, json.issue.number)
			res.send("ok")
			return;
		}
		if (idx != 0) {
			/* TODO: send a comment that format is wrong */
			github_comment(`Sorry, I couldn't understand that.`, json.repository.name, json.issue.number)
			res.send("ok")
			return;
		}
		command = comment.substr(2 + config.bot_name.length)
		if (command === "runbenchmarks") {
			logger.info(`benchmarking job sent for ${json.repository.name} by ${json.comment.user.login}`)
			github_comment(`Your benchmarking request is accepted. I will get back to you once the job is complete.`, json.repository.name, json.issue.number)
			request({
				headers: {
					"User-Agent": config.admin
				},
				method: "GET",
				uri: `https://api.github.com/repos/${config.org}/${json.repository.name}/pulls/${json.issue.number}?client_id=${config.github_outh_client_id}&client_secret=${config.github_outh_client_secret}`
			}, (err, res1, body) => {
				if (err) throw err;
				json2 = JSON.parse(body)
				utils.generate_temp_report(json.repository.name, json.issue.number, json2.head.sha)
				url = encodeURI(`${config.jenkins_url}/job/${config.jenkins_job}/buildWithParameters?ORG=${(json.repository.owner.login)}&REPOSITORY=${(json.repository.name)}&PR=${json.issue.number}&token=${(config.jenkins_auth_token)}`)
				request({
					uri: url,
					method: "GET"
				}, (err2, res2, body2) => {
					if (err2) throw err2;
					logger.info(`benchmarking job inititated for ${json.repository.name} by ${json.comment.user.login}`)
				})
			})
		}

	}
})

function github_comment(comment, repo, issue) {
	request({
		headers: {
			"User-Agent": config.admin,
			"Authorization": `token ${config.bot_account_token}`
		},
		method: "POST",
		uri: `https://api.github.com/repos/${config.org}/${repo}/issues/${issue}/comments?client_id=${config.github_outh_client_id}&client_secret=${config.github_outh_client_secret}`,
		body: `{ "body": "${comment}" }`
	}, (err, res, body) => {
		if (err) throw err;
		if (JSON.parse(body).body !== comment)
			logger.error("problem creating comment")
	})
}
/* LISTEN */
var listener = app.listen(process.env.PORT || 8081, () => {
	logger.info(`Server running at ${listener.address().port}`)
})
