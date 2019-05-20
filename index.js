var express = require("express");
var logger  = require("logger").createLogger('development.log');
var fs      = require("fs");
var request = require("request");
var utils   = require("./utils");
var GitHub  = require("./github").GitHub;
var Jenkins = require("./jenkins").Jenkins

/* MIDDLEWARES */
var app = express()
app.use(express.urlencoded({extended: true}));
app.use(express.json());
app.use(express.static('public'))
app.set('view engine', 'ejs');

/* BOOTSTRAP */
!fs.existsSync(__dirname + `/reports`) && fs.mkdirSync(__dirname + `/reports`);
config = JSON.parse(fs.readFileSync(__dirname + "/config.json"))
github = new GitHub(config.admin, config.github_outh_client_id, config.github_outh_client_secret, config.bot_account_token)
jenkins = new Jenkins(config.jenkins_url, config.jenkins_job, config.jenkins_auth_token, config.homepage_url, config.jenkins_user, config.jenkins_password)

/* PUBLIC ROUTES */
app.get("/", (req, res) => {
	res.render("index", {registered_repos: config.registered_repos, org: config.org, repo: "", bot: config.bot_name, benchmarkers: config.benchmarkers, admin: config.admin})
});

app.get("/packages/:repo", (req, res) => {
	if (config.registered_repos.includes(req.params.repo))
		res.render("repo", {registered_repos: config.registered_repos, org: config.org, repo: req.params.repo});
	else
		res.status(404).render("404", {registered_repos: config.registered_repos, org: config.org, repo: req.params.repo})
})

app.get("/packages/:repo/:pr", (req, res) => {
	if (config.registered_repos.includes(req.params.repo))
		res.render("pr", {registered_repos: config.registered_repos, org: config.org, repo: req.params.repo, pr: req.params.pr})
	else
		res.status(404).render("404", {registered_repos: config.registered_repos, org: config.org, repo: req.params.repo})
})

app.get("/packages/:repo/:pr/:commit", (req, res) => {
	if (config.registered_repos.includes(req.params.repo) && (req.params.commit.indexOf(".") === -1)) {
			res.render("build", {registered_repos: config.registered_repos, org: config.org, repo: req.params.repo, pr: req.params.pr, commit: req.params.commit})
	}
	else
		res.status(404).render("404", {registered_repos: config.registered_repos, org: config.org, repo: req.params.repo})
}) 

/* API */

app.get("/api/pr/:repo/:pr", (req,res) => {
	if (!config.registered_repos.includes(req.params.repo)){
		res.status(404).send("not found");
		return;
	}

	github.getPR(config.org, req.params.repo, req.params.pr, (err, json) => {
		if (err) {
			res.status(500).send("Internal Error");
			throw err;
		}
		res.json({number: json.number, author: json.user.login, title: json.title})
	})
})

app.get("/api/commits/:repo/:pr/", (req,res) => {
	if (!config.registered_repos.includes(req.params.repo)){
		res.status(404).send("not found");
		return;
	}

	github.getCommits(config.org, req.params.repo, req.params.pr, (err, json) => {
		if (err) {
			res.status(500).send("Internal Error");
			throw err;
		}
		res_json = []
		json.forEach((commit) => {
			res_json.push({sha: commit.sha, message: commit.commit.message})
		})
		res.json(res_json)
	})
})

app.get("/api/builds/:repo/:pr", (req, res) => {
	if (!config.registered_repos.includes(req.params.repo)){
		res.status(404).send("not found");
		return;
	}

	if (!fs.existsSync(__dirname + `/reports/${req.params.repo}`)) {
		res.json({ builds: [] })
		return;
	}
	if (!fs.existsSync(__dirname + `/reports/${req.params.repo}/${req.params.pr}`)) {
		res.json({ builds: [] })
		return;
	}
	dir = __dirname + `/reports/${req.params.repo}/${req.params.pr}/`
	builds = fs.readdirSync(dir)
				.map(function(v) { 
                  return { name:v,
                           time:fs.statSync(dir + v).mtime.getTime()
                         }; 
               })
               .sort(function(a, b) { return b.time - a.time; })
               .map(function(v) { return v.name; });
    found_qid = false;
	for (var i = builds.length - 1; i >= 0; i--) {
		if (builds[i] === "qid") {
			found_qid = true;
			continue;
		}
		if (found_qid) {
			builds[i+1] = builds[i].substr(0, builds[i].length-5) // Removing `.json`
		}
		else {
			builds[i] = builds[i].substr(0, builds[i].length-5) // Removing `.json`
		}
	}
	if (found_qid) {
		res.json({builds: builds.splice(1)})
	}
	else {
		res.json({builds})
	}
})

app.get("/api/build/:repo/:pr/:commit", (req, res) => {
	if (!config.registered_repos.includes(req.params.repo) || (req.params.commit.indexOf(".") !== -1)){
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

	github.getOpenPulls(config.org, req.params.repo, (err, json) => {
		if (err) {
			res.status(500).send("Internal Error")
			throw err;
		}
		else {
			if(!(json instanceof Array)) {
				res.status(500).send("Internal Error");
				return;
			}
			data = []
			json.forEach((pr) => {
				obj = { title: pr.title, number: pr.number, author: pr.user.login }
				data.push(obj);
			})
			res.json(data);
		}
	})
})

/* FOR JENKINS */
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
	utils.generate_report(report, (success) => {
		if (success) {
			github.makeComment(`Benchmark report for ${report.commit.substr(0,7)} is generated and can be found [here](${config.homepage_url}/packages/${report.repo}/${report.pr}/${report.commit})`, config.org, report.repo, report.pr)
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

app.get("/api/report_started", (req, res) => {
	utils.job_started(req.query.repo, req.query.pr, req.query.commit)
	res.send("ok")
})
app.get("/api/report_failed", (req, res) => {
	utils.job_failed(req.query.repo, req.query.pr, req.query.commit)
	res.send("ok")
})
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
			/* Send a comment that this repo is not authorized/registered */
			github.makeComment(`Sorry, but this repository is not registered to work with me. cc @${config.admin}`, config.org, json.repository.name, json.issue.number)
			res.send("ok")
			return;
		}
		if (!config.benchmarkers.includes(json.comment.user.login)) {
			/* send a comment that you cant do that */
			github.makeComment(`Sorry, but you cannot do that, instead you can ask @${config.admin} to run benchmarks.`, config.org, json.repository.name, json.issue.number)
			res.send("ok")
			return;
		}
		if (idx != 0) {
			/* send a comment that format is wrong */
			github.makeComment(`Sorry, I couldn't understand that.`, json.repository.name, json.issue.number)
			res.send("ok")
			return;
		}
		command = comment.substr(2 + config.bot_name.length)
		if (command === "runbenchmarks") {
			github.getPR(config.org, json.repository.name, json.issue.number, (err, json2) => {
				if (err) throw err;
				if (utils.is_already_queued(json.repository.name, json.issue.number, json2.head.sha)) {
					github.makeComment(`Benchmarking request for this PR is already in queue. Either abort it or wait for it to get completed.`, config.org, json.repository.name, json.issue.number)
				}
				else {
					logger.info(`benchmarking job sent for ${json.repository.name} by ${json.comment.user.login}`)
					github.makeComment(`Your benchmarking request is accepted. I will get back to you once the job is complete.`, config.org, json.repository.name, json.issue.number)
					utils.generate_temp_report(json.repository.name, json.issue.number, json2.head.sha)
					jenkins.build(json.repository.owner.login, json.repository.name, json.issue.number)
				}
			})
		}
		else if (command === "abort") {
			github.getPR(config.org, json.repository.name, json.issue.number, (err, json2) => {
				if (err) throw err;
				if (utils.is_already_queued(json.repository.name, json.issue.number, json2.head.sha)) {
					github.makeComment(`Benchmarking job for this pull request is aborted.`, config.org, json.repository.name, json.issue.number)
					jenkins.abort(json.repository.name, json.issue.number);
					utils.abort(json.repository.name, json.issue.number)
				}
				else {
					github.makeComment(`No queued job found for this pull request.`, config.org, json.repository.name, json.issue.number)
				}
			})
		}

	}
})

/* LISTEN */
var listener = app.listen(process.env.PORT || 8081, () => {
	logger.info(`Server running at ${listener.address().port}`)
})
