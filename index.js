var express = require("express");
var logger  = require("logger").createLogger('development.log');
// var ejs     = require("ejs");
var fs      = require("fs");
var utils   = require("./utils");
var app = express()
app.use(express.urlencoded());
app.use(express.json());
!fs.existsSync(__dirname + `/public`) && fs.mkdirSync(__dirname + `/public`);
// CONFIG BEGIN
KEY = "secret_secret_secret"
// CONFIG END

app.post("/report", (req, res) => {
	key = req.body.key;
	if (key !== KEY) {
		res.status(401).send("not authorized");
		return;
	}
	/* TODO: Make a route `/:repo/:pr/:commit` where report is displayed, make /:repo, /:repo/:pr if not already made, and add entry to both the pages*/
	/* TIP: We can make `/:repo/:pr/:commit` static */

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
	res.send("Hello!")
	/* List of all repos */
});

app.get("/:repo", (req, res) => {
	/* Open PRs of a given repo */
})

app.get("/:repo/:pr/:commit", (req, res) => {
	/* Latest report */
	res.sendFile(__dirname + `/public/${req.params.repo}/${req.params.pr}/${req.params.commit}.html`)
}) 

var listener = app.listen(process.env.PORT || 8081, () => {
	logger.info(`Server running at ${listener.address().port}`)
})