var request = require("request")
var syncRequest = require("sync-request")
const { execSync } = require('child_process');
var fs = require('fs')

function GitlabProject(agent, project_id, access_token) {
	this.agent = agent
	this.project_id = project_id
	this.access_token = access_token
	this.project_string = ""
}

/* Template request for gitlab, reduce unnecesarily same URLs in every function */
/* TODO: Make something similar for `github.js` */
GitlabProject.prototype.makeRequest = function(method, endpoint, data, cb) {
	/* This is a basic trick for preventing double slashes i.e. `gitlab.com//projects` */
	/* For GET requests it doesn't matter because request gets redirected to single slash by default */
	/* But for POST requests, this isn't true by default */
	url = endpoint[0] === '/' ? `https://gitlab.com/api/v4/projects/${this.project_id}${endpoint}` : `https://gitlab.com/api/v4/projects/${this.project_id}/${endpoint}`
	request({
		headers: {
			"Private-Token": this.access_token
		},
		followAllRedirects: true,
		uri: url,
		method: method
	}, (err, res, body) => {
		cb(err, res, body)
	})
}

/* Get running or pending job for the BenchmarkRepo project */
GitlabProject.prototype.getRunningOrPendingJobs = function(cb) {
	this.makeRequest("GET", "/jobs?scope[]=pending&scope[]=running", "",
		(err, res, body) => {
			if (err) throw err;
			cb(JSON.parse(body))
		})
}

/* Check if there is any job pending/running for a PR */
/* We make a branch with format `repo-pr` */
/* So we check if there is any job for which the ref is of this form */
GitlabProject.prototype.is_job_already_queued = function(repo, pr, cb) {
	this.getRunningOrPendingJobs((json) => {
		for(var i = 0; i < json.length; i++) {
			if(json[i].ref === `${repo}-${pr}`) {
				cb(true);
				return;
			}
		}
		cb(false)
	})
}

/* Cancel a job from job id */
GitlabProject.prototype.cancleJob = function(jobid) {
	this.makeRequest("POST", `/jobs/${jobid}/cancel`, "",
		(err, res, body) => {
			if (err) throw err;
		})
}

/* Cancel a benchmarking job for a PR */
GitlabProject.prototype.abort_job = function(repo, pr) {
	this.getRunningOrPendingJobs((json) => {
		for(var i = 0; i < json.length; i++) {
			if(json[i].ref === `${repo}-${pr}`) {
				this.cancleJob(json[i].id)
			}
		}
	})
}


// before_script:
//   - julia -e "using Pkg; Pkg.add(\\"https://github.com/JuliaDiffEq/DiffEqDiagrams.jl\\")"

/* Generate the YAML file */
GitlabProject.prototype.generate_ci_yaml = function(org, repo, pr, commit, fallback) {
	ret = `
variables:
  ORG: "${org}"
  REPO: "${repo}"
  PR: "${pr}"
  COMMIT: "${commit}"
  FALLBACK: "${fallback}"

stages:
  - first
  - second

main:
  stage: first
  script:
    - git clone https://github.com/${org}/${repo}
    - cd ${repo}
    - git fetch origin pull/${pr}/head:pr/${pr}
    - git checkout pr/${pr}
    - julia -e "using Pkg;Pkg.clone(pwd());"
    - cd ..
    - curl "${fallback}/api/report_started?repo=${repo}&pr=${pr}&commit=${commit}"
    - julia run.jl "${repo.split(".")[0]}" "${pr}" "${commit}" "${fallback}"

failed_job:
  stage: second
  script:
    - curl "${fallback}/api/report_failed?repo=${repo}&pr=${pr}&commit=${commit}"
  when: on_failure

`
	return ret
}

/* Push the generated yaml file to a new branch by name of `repo-pr` */
GitlabProject.prototype.push_to_benchmark_repo = function(org, repo, issue, yaml) {
	folder = `${__dirname}/workingdir/${org}-${repo}-${issue}`
	branch = `${repo}-${issue}`
	pathopt = {cwd: folder}

	execSync(`mkdir ${folder}`)
	execSync(`git clone https://oauth2:${this.access_token}@gitlab.com/${this.project_string}.git ${folder}`)
	execSync(`git checkout -b ${branch}`, pathopt)
	fs.writeFileSync(`${folder}/.gitlab-ci.yml`, yaml)
	execSync(`git add .gitlab-ci.yml`, pathopt)
	execSync(`git commit -m "Update .gitlab-ci.yml"`, pathopt)
	execSync(`git push -f origin ${branch}`, pathopt)
	execSync(`rm -rf ${folder}`)
}

/* Inititalize git/gitlab for the heroku dyno */
GitlabProject.prototype.init = function() {
	execSync(`git config --global user.email "${this.agent.email}"`)
	execSync(`git config --global user.name "${this.agent.name}"`)
	res = syncRequest('GET', `https://gitlab.com/api/v4/projects/${this.project_id}`,{
	  headers: {
	    "Private-Token": this.access_token
	  }
	})
	var json = JSON.parse(res.getBody('utf8'));
	this.project_string = json.path_with_namespace
}

exports.GitlabProject = GitlabProject