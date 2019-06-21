var express =       require("express");
var fs      =       require("fs");
var request =       require("request");
var GitHub  =       require("./github").GitHub;
var GitlabProject = require("./gitlab").GitlabProject

/* MIDDLEWARES */
var app = express()
app.use(express.urlencoded({extended: true}));
app.use(express.json());
app.use(express.static('public'))
app.set('view engine', 'ejs');

/* BOOTSTRAP */
/* working Directory is the directory where we temporarily pull the BenchmarkRepo and make a */
/* new branch and push to gitlab */
!fs.existsSync(__dirname + `/workingdir`) && fs.mkdirSync(__dirname + `/workingdir`);
/* Reading configuration from config.json */
config = JSON.parse(fs.readFileSync(__dirname + "/config.json"))
/* Making a GitHub object (definations are in github.js) */
/* We interact to GitHub through this object */
github = new GitHub(config.admin, config.github_app.client_id, config.github_app.client_secret, config.github_account.access_token, config.reports_repo)
/* Making a GitlabProject object (definations are in gitlab.js) */
/* We interact to our Benchmarking Repo on Gitlab through this object */
gitlab = new GitlabProject(config.admin, config.gitlab_account.benchmarking_repo_id, config.gitlab_account.access_token)
/* Initializing GitlabProject Object */
gitlab.init();

/* Homepage of Bot URL */
/* TODO: Connect Frontent to Bot */
/* We already have some views in `views` directory */
app.get('/', (req, res) => {
	res.send("hello")
})

/* This endpoint is of use when we deploy bot on a free dyno */
/* Make some computer ping this endpoint every 15 minutes so that the dyno doesn't shut down */
/* Hence the requests would be faster */
app.get('/keepalive', (req, res) => {
	res.send("ok");
})


/* Section: Gitlab Runner Endpoints */
/* This is the endpoint where the Gitlab runner submits the final report */
/* Format of the report is availible in `sample.report.json` */
app.post("/api/report", (req, res) => {
	key = req.body.key;
	/* We check if the request is actually sent by the runner */
	/* If the key is wrong, we send a not authorized status */
	if (key !== config.gitlab_runner_secret) {
		res.status(401).send("not authorized");
		return;
	}

	report = req.body.report;
	/* Check if the repository mentioned in the report is registered or not */
	if (!config.registered_repos.includes(report.repo)){
		res.status(404).send("not found");
		return;
	}

	/* If the code reaches here, that means the request is valid */
	/* We now generate a report on the Reports repository on GitHub */
	github.generate_report(report, (filename) => {
		/* Make a comment on the repository that the report is ready */
		github.makeComment(`Benchmark report for ${report.commit.substr(0,7)} is generated and can be found [here](https://github.com/DiffEqBot/Reports/blob/master/${report.repo}/${report.pr}/${report.commit}/${filename}.md)`, config.org, report.repo, report.pr)
		/* Maintain a local heroku log too */
		console.log(`Performance report generated for ${report.repo}#${report.pr}(${report.commit})`);
	});
	/* Respond with something or else you get unnecesary internal errors logged in heroku metrics */
	res.send("ok");
});

/* Endpoint where gitlab runner reports that the job has been converted from pending to running */
app.get("/api/report_started", (req, res) => {
	res.send("ok")
})

/* Endpoint where the gitlab runner reports when the job fails */
app.get("/api/report_failed", (req, res) => {
	github.makeComment(`Your benchmarking job for ${req.query.commit.substr(0,7)} failed.`, config.org, req.query.repo, req.query.pr)
	res.send("ok")
})
/* TODO: We need to have to verify the requests on the above two endpoints in the same way we verify for `/api/report` */
/* Even though its not that big of an issue, but we dont want people to unnecesarily make comment on DiffEqBot's name  */

/* Section: Bot Endpoint */
/* This is the endpoint where the GitHub app submits the JSON of every comment event on JuliaDiffEq organization's repositories */
app.post(`${config.github_app.bot_endpoint}`, (req, res) => {
	json = req.body;
	/* Some sanity checks */
	/* For format of the json sent by GitHub, check out https://developer.github.com/webhooks */
	if (json.action === "created"             &&
		json.issue !== undefined              &&
		json.comment !== undefined            &&
		json.issue.pull_request !== undefined
		) {
		/* Remove unnecesary whitespaces from the ends of comment */
		comment = json.comment.body.trim()
		/* Find the position the mention of bot */
		idx = comment.indexOf(`@${config.bot_name}`)
		/* Not of our interest if they haven't mentioned DiffEqBot */
		if (idx == -1) {
			res.send("ok")
			return;
		}
		/* Check the organization and repository of webhook  */
		if (json.repository.owner.login !== config.org || !config.registered_repos.includes(json.repository.name)) {
			/* Send a comment that this repo is not authorized/registered */
			github.makeComment(`Sorry, but this repository is not registered to work with me. cc @${config.admin.github_handle}`, json.repository.owner.login, json.repository.name, json.issue.number)
			res.send("ok")
			return;
		}
		if (!config.benchmarkers.includes(json.comment.user.login)) {
			/* send a comment that you cant do that */
			github.makeComment(`Sorry, but you cannot do that, instead you can ask @${config.admin.github_handle} to run benchmarks.`, config.org, json.repository.name, json.issue.number)
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
		/* parsing the command */
		if (command === "runbenchmarks") {
			/* Get PR data from GitHub, used to get the latest commit */
			github.getPR(config.org, json.repository.name, json.issue.number, (err, json2) => {
				if (err) throw err;
				/* Check if there is already some job queued for this PR (that is either running or pending) */
				gitlab.is_job_already_queued(json.repository.name, json.issue.number, (queued) => {
					/* If queued, do not run benchmarks */
					if (queued)
						github.makeComment(`Benchmarking request for this PR is already in queue. Either abort it or wait for it to get completed.`, config.org, json.repository.name, json.issue.number)
					else {
						console.log(`benchmarking job sent for ${json.repository.name} by ${json.comment.user.login}`)
						github.makeComment(`Your benchmarking request is accepted. I will get back to you once the job is complete.`, config.org, json.repository.name, json.issue.number)
						/* Generate Gitlab CI yaml file */
						yaml = gitlab.generate_ci_yaml(config.org, json.repository.name, json.issue.number, json2.head.sha, config.homepage_url)
						/* Use that yaml file and push to branch `repo-pr` */
						gitlab.push_to_benchmark_repo(config.org, json.repository.name, json.issue.number, yaml)
					}
					res.send("ok")
				})
			})
		}
		else if (command === "abort") {
			/* Get PR data from GitHub, used to get the latest commit */
			github.getPR(config.org, json.repository.name, json.issue.number, (err, json2) => {
				if (err) throw err;
				/* Can abort only if there is already queued job */
				gitlab.is_job_already_queued(json.repository.name, json.issue.number, (queued) => {
					if (queued) {
						github.makeComment(`Benchmarking job for this pull request is aborted.`, config.org, json.repository.name, json.issue.number)
						/* Abort job on gitlab runner */
						gitlab.abort_job(json.repository.name, json.issue.number);
					}
					else {
						github.makeComment(`No queued job found for this pull request.`, config.org, json.repository.name, json.issue.number)
					}
					res.send("ok")
				})
			})
		}

	}
	else {
		res.send("ok")
	}
})

/* Listener */
var listener = app.listen(process.env.PORT || 8081, () => {
	console.log(`Server running at ${listener.address().port}`)
})
