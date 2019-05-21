using JSON, PkgBenchmark, BenchmarkTools
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

using DiffEqDiagrams
set_imgur_key("1c7ba4566cd9671")
diagrams = generate_diagrams(ARGS[1])

d = ""
for i in keys(diagrams)
    global d
    d = d*"""
            ,{
                "type": "image",
                "id": "img_$(i)",
                "title": "$(i)",
                "data": "$(diagrams[i])"
            }
          """
end

payload = 
    """
    {
        "key": "secret_secret_secret",
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
