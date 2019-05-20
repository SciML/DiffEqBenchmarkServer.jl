using GitHub, JSON, PkgBenchmark, BenchmarkTools
judgement = judge(ARGS[1], "HEAD", "master");
entries = BenchmarkTools.leaves(judgement.benchmarkgroup)
entries = entries[sortperm(map(x -> string(first(x)), entries))]

table = ""
idx = 0
for t in entries
    global idx += 1
    global table
    table *= "[\"$(t[1][2])\", $(time(ratio(t[2]))), $(memory(ratio(t[2])))]"
    if idx != length(entries)
        table *= ","
    end
end


GLOBAL_IMGUR_KEY = "place_an_imgur_key_here"

macro imgur(comm)
    return :(io_imgur = IOBuffer();p_imgur = $comm; show(io_imgur, MIME("image/png"), p_imgur);img_imgur = String(take!(io_imgur));r_imgur = HTTP.post("https://api.imgur.com/3/image", ["Authorization"=> "Client-ID $(GLOBAL_IMGUR_KEY)", "Accept"=> "application/json"], img_imgur);JSON.parse(String(r_imgur.body))["data"]["link"])
end


include("$(ARGS[4])/benchmark/diagrams.jl")

d = ""
for i in keys(DIAGRAMS)
    global d
    d = d*"""
            ,{
                "type": "image",
                "id": "img_$(i)",
                "title": "$(i)",
                "data": "$(DIAGRAMS[i])"
            }
          """
end

payload = 
    """
    {
        "key": "jenkins_secret_from_config_json",
        "report": {
            "repo": "$(ARGS[1]).jl",
            "pr": $(ARGS[2]),
            "commit": "$(ARGS[3][1:40])",
            "items": [
                {
                    "type": "table",
                    "id": "regres",
                    "title": "Performance Ratios for various methods",
                    "data": {
                        "head": ["Algorithm", "Time Ratio", "Memory Ratio"],
                        "table": [
                            $(table)
                        ]
                    }
                }
                $(d)
            ]
        }
    }
    """

using HTTP
HTTP.post("$(ARGS[5])/api/report", ["Content-Type" => "application/json"], payload)

