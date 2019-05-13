var express = require("express");
var logger  = require("logger").createLogger('development.log');
// var ejs     = require("ejs");
var fs      = require("fs");
var request = require("request")
var utils   = require("./utils");
var app = express()
app.use(express.urlencoded());
app.use(express.json());
app.use(express.static('public'))
app.set('view engine', 'ejs');
!fs.existsSync(__dirname + `/reports`) && fs.mkdirSync(__dirname + `/reports`);
config = JSON.parse(fs.readFileSync(__dirname + "/config.json"))
// Mongo Setup
const MongoClient = require('mongodb').MongoClient;
const uri = config.db_url;
const db = new MongoClient(uri, { useNewUrlParser: true });
db.connect(err => {
  if (err) {
  	logger.error("MongoDB connect failed");
  	exit(1);
  }
});
// CONFIG BEGIN
KEY = "secret_secret_secret"
// CONFIG END

app.post("/report", (req, res) => {
	key = req.body.key;
	if (key !== KEY) {
		res.status(401).send("not authorized");
		return;
	}

	/* Generate a static report */
	report = req.body.report;
	utils.generate_report(report, (success) => {
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

app.get("/", (req, res) => {
	res.render("index")
});

app.get("/packages/:repo", (req, res) => {
	res.render("repo", {repo: req.params.repo});
})

app.get("/packages/:repo/:pr", (req, res) => {
	res.render("pr", req.params)
})

app.get("/packages/:repo/:pr/:commit", (req, res) => {
	/* Latest report */
	res.sendFile(__dirname + `/reports/${req.params.repo}/${req.params.pr}/${req.params.commit}.html`)
}) 

var listener = app.listen(process.env.PORT || 8081, () => {
	logger.info(`Server running at ${listener.address().port}`)
})

// API

app.get("/api/pr/:repo/:pr", (req,res) => {
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

app.get("/api/repo_open_pulls/:repo", (req, res) => {
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