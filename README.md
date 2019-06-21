# DiffEqBenchmarkServer

This is the node server behind the working of the DiffEqBot. Follow the step by step instructions for deploying your own bot.

## Instructions

1. Make the configuration file `config.json` using the template `sample.config.json`. Enter the details of the admin in the `admin` field and name of your organization on GitHub in the `org` field.
2. Make an empty heroku app with name of your choice. Place the url of your app in the field `homepage_url` of the configuration file.
3. Make 2 accounts - one on GitHub and the other on Gitlab with the same handle. Plug the handle in the field `bot_name`.
4. From the GitHub account, make a personal access token with `public_repo` scope (you can make one [here](https://github.com/settings/tokens/new?description=DiffEqBot&scopes=public_repo)). Plug this access token in the field `github_account.access_token` of configuration.
5. From the Gitlab account, make a personal access token with `api` and `read_repository` scopes. Place this token in the `gitlab_account.access_token` field of configuration file.
6. Under you organization, make a private GitHub App with webhook URL to some secret endpoint of the heroku app. Add that endpoint to the `github_app.bot_endpoint` field of config. Give read and wite permissions to Issues and Pull Requests. Subscribe to events `Issue comment`, `Pull Request Review`, `Pull Request` and `Pull Request Review Comment`. It should look like this - 
![](https://i.imgur.com/CY7K8x1.png)
![](https://i.imgur.com/Ka3T42Q.png)
7. Copy the generated `client_id` and `client_secret` to the `github_app.client_id` and `github_app.client_secret` field of config respectively. Install the app in your organization.
8. Now make an empty repository on GitHub for storing reports (can be under any owner, but the bot account should have write access to it). State that repository in the `reports_repo` field of config.
9. Make a private repo on Gitlab (for triggering jobs) (can be under any owner, but the bot account should have write access to it). It should have a `run.jl` file in it's root. This script would be passed repository name, pull request number, latest commit hash and the root of the heroku app in order when its executed. This script should do the necessary benchmarking job for your needs and send the report back to the fallback url with endpoint `/report` in the format as described in the [Report Format](#Report-Format) section along with a secret. This secret should be placed in the `gitlab_runner_secret` field of config.
10. Place the handles of users to whom you want to give access to running benchmarks in `benchmarkers` array of config.
11. To enable the bot for a particular repository of your organization, add the name of the repository in the `registered_repos` field.
12. Deploy the app with this config file on heroku. _Keep this config file safe and secure_.

## Report Format

The report should look something like this - 
```json
{
  "key": "much_secret_very_secure",
  "report": {
    "repo": "Sample",
    "pr": 1,
    "commit": "abcdefabcdefabcdefabcdefabcdefabcdefabcd",
    "items": [
      {
        "type": "table",
        "id": "regres",
        "title": "Performance Ratios for various methods",
        "data": {
          "head": [
            "Algorithm",
            "Time Ratio",
            "Memory Ratio"
          ],
          "table": [
            [
              "BS3",
              0.953891982903769,
              1
            ],
            [
              "KenCarp4",
              1.0051193674286583,
              1
            ],
            [
              "Rosenbrock23",
              1.0043137254901962,
              1
            ],
            [
              "Tsit5",
              0.9872329977903265,
              1
            ],
            [
              "Vern6",
              1.0316647705726203,
              1
            ],
            [
              "Vern7",
              0.9625197958824564,
              1
            ],
            [
              "Vern9",
              0.000001349104901926398,
              0.00005408944201892311
            ]
          ]
        }
      },
      {
        "type": "image",
        "id": "img_LotkaVolterra",
        "title": "LotkaVolterra",
        "data": "https://i.imgur.com/Crl9Ut2.png"
      }
    ]
  }
}
```

The field `items` is an array which contains objects of format
```json
{
	"type": "",
	"id": "",
	"title": "",
	"data": ""
}
```

Currently there are two types of items supported - `table` and `image`. For `table`, `data` field should be an object with two arrays `head` and `table`. `head` is the array of column names while `table` is array of array of the table data. For `image` type, `data` is simply the link to the image.
