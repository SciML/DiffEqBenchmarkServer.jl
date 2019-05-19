git clone "https://github.com/$ORG/$REPOSITORY";
cd "$REPOSITORY";
git fetch origin pull/$PR/head:pr/$PR
git checkout pr/$PR
WITHOUT_JL="$(echo $REPOSITORY | cut -d'.' -f 1)"
COMMIT_HASH="$(git rev-parse HEAD)"
curl "http://localhost:8081/api/report_started?repo=$REPOSITORY&pr=$PR&commit=$COMMIT_HASH"
julia -e "using Pkg;Pkg.clone(pwd());"
PKG_ROOT="$(pwd)"
julia --color=no /home/kanav/run.jl "$WITHOUT_JL" "$PR" "$COMMIT_HASH" "$PKG_ROOT"
