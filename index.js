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
	res.render("index", {registered_repos: config.registered_repos, org: config.org})
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

app.get("/api/builds/:repo/:pr", (req, res) => {
	if (!config.registered_repos.includes(req.params.repo)){
		res.status(404).send("not found");
		return;
	}

	if (!fs.existsSync(__dirname + `/reports/${req.params.repo}`)) {
		res.json({ message: "no repo" })
		return;
	}
	if (!fs.existsSync(__dirname + `/reports/${req.params.repo}/${req.params.pr}`)) {
		res.json({ message: "no pull" })
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

/* LISTEN */
var listener = app.listen(process.env.PORT || 8081, () => {
	logger.info(`Server running at ${listener.address().port}`)
})
