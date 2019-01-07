
module.exports = function(RED) {
    "use strict";
    var Stream = require('stream');
    var FeedParser = require("feedparser");
    var request = require("request");
    var url = require('url');

    function FeedParseNode(n) {
        RED.nodes.createNode(this,n);
        this.url = n.url;
        var node = this;
        this.seen = {};
        var parsedExp = n.expr;
        if (parsedExp) {
            try {
                parsedExp = RED.util.prepareJSONataExpression(parsedExp, this);
            }
            catch (e) {
                node.error(RED._("feedparse3.errors.invalidexp",{message:e.toString()}));
                return;
            }
        } else if (this.url) {
            var parsedUrl = url.parse(this.url);
            if (!(parsedUrl.host || (parsedUrl.hostname && parsedUrl.port)) && !parsedUrl.isUnix) {
                this.error(RED._("feedparse3.errors.invalidurl"));
            }
        }

        var getFeed = function(msg) {
            var feedparser = new FeedParser();
            feedparser.on('error', function(error) { node.error(error); });
			feedparser.on('readable', function () {
				var stream = this, article;
				while (article = stream.read()) {  // jshint ignore:line
					if (!(article.guid in node.seen) || ( node.seen[article.guid] !== 0 && node.seen[article.guid] != article.date.getTime())) {
						node.seen[article.guid] = article.date?article.date.getTime():0;

						msg.topic = article.origlink || article.link
						msg.payload = article.description
						msg.article = article

						node.send(msg);
					}
				}
			});
            feedparser.on('meta', function (meta) {});
            feedparser.on('end', function () {});

            if (parsedExp) {
                RED.util.evaluateJSONataExpression(parsedExp, msg, (err, result) => {
                    if (err) {
                        node.error(RED._("feedparse3.errors.invalidexp",{message:err.toString()}));
                    } else {
                        var stream = Stream.PassThrough();
                        stream.write(result);
                        stream.end();
                        stream.pipe(feedparser);
                    }
                });
            } else if (this.url) {
                var req = request(node.url, {timeout:10000, pool:false});
                //req.setMaxListeners(50);
                req.setHeader('user-agent', 'Mozilla/5.0 (Node-RED)');
                req.setHeader('accept', 'text/html,application/xhtml+xml');

                req.on('error', function(err) { node.error(err); });

                req.on('response', function(res) {
                    if (res.statusCode != 200) { node.warn(RED._("feedparse3.errors.badstatuscode")+" "+res.statusCode); }
                    else { res.pipe(feedparser); }
                });
            };
        }

        this.on("input", function(msg) {
            getFeed(msg);
        });
    }

    RED.nodes.registerType("feedparse3",FeedParseNode);
}
