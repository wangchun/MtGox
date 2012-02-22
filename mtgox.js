var https = require('https');
var zlib = require('zlib');
var io = require('socket.io-client');

var bids = {};
var asks = {};
var recent_trades = {};

var load_depth_timeoutId = null;
var load_trades_timeoutId = null;

function print() {
	var now = new Date();
	var _bids = [];
	for (var price in bids) {
		if (price > 0 && bids[price].volume > 0) {
			_bids.push(price);
		}
	}
	_bids.sort(function(a, b) {
		return a - b;
	});
	var _asks = [];
	for (var price in asks) {
		if (price > 0 && asks[price].volume > 0) {
			_asks.push(price);
		}
	}
	_asks.sort(function(a, b) {
		return a - b;
	});
	var _trades = [];
	for (var tid in recent_trades) {
		var trade = recent_trades[tid];
		if (now - trade.timestamp >= 86400000) {
			delete recent_trades[tid];
			continue;
		}
		_trades.push(trade);
	}
	_trades.sort(function(a, b) {
		return a.timestamp - b.timestamp;
	});
	var size = process.stdout.getWindowSize();
	process.stdout.write('\x1b[H');
	process.stdout.write('                                                                                                  \n');
	process.stdout.write('                                                                                                  \n');
	for (var i = 0; i < size[1] - 4; i++) {
		var bid = _bids[_bids.length - (i + 1)];
		if (bid == undefined) {
			bid_line = '                        ';
		} else {
			var price = Math.abs(bid % 100000).toString();
			while (price.length < 5) {
				price = '0' + price;
			}
			price = Math.abs(~~(bid / 100000)).toString() + '.' + price;
			while (price.length < 9) {
				price = ' ' + price;
			}
			var volume = Math.abs(bids[bid].volume % 100000000).toString()
			while (volume.length < 8) {
				volume = '0' + volume;
			}
			volume = Math.abs(~~(bids[bid].volume / 100000000)).toString() + '.' + volume;
			while (volume.length < 15) {
				volume = ' ' + volume;
			}
			bid_line = price + volume;
			if (bid_line.length > 24) {
				bid_line = '------------------------';
			}
		}
		var ask = _asks[i];
		if (ask == undefined) {
			ask_line = '                        ';
		} else {
			var price = Math.abs(ask % 100000).toString();
			while (price.length < 5) {
				price = '0' + price;
			}
			price = Math.abs(~~(ask / 100000)).toString() + '.' + price;
			while (price.length < 9) {
				price = ' ' + price;
			}
			var volume = Math.abs(asks[ask].volume % 100000000).toString()
			while (volume.length < 8) {
				volume = '0' + volume;
			}
			volume = Math.abs(~~(asks[ask].volume / 100000000)).toString() + '.' + volume;
			while (volume.length < 15) {
				volume = ' ' + volume;
			}
			ask_line = price + volume;
			if (ask_line.length > 24) {
				ask_line = '------------------------';
			}
		}
		var trade = _trades[_trades.length - (i + 1)];
		if (trade == undefined) {
			trade_line = '                                  ';
		} else {
			var hour = trade.timestamp.getUTCHours().toString();
			while (hour.length < 2) {
				hour = '0' + hour;
			}
			var minute = trade.timestamp.getUTCMinutes().toString();
			while (minute.length < 2) {
				minute = '0' + minute;
			}
			var second = trade.timestamp.getUTCSeconds().toString();
			while (second.length < 2) {
				second = '0' + second;
			}
			var timestamp = hour + ':' + minute + ':' + second;
			var price = Math.abs(trade.price % 100000).toString();
			while (price.length < 5) {
				price = '0' + price;
			}
			price = Math.abs(~~(trade.price / 100000)).toString() + '.' + price;
			while (price.length < 9) {
				price = ' ' + price;
			}
			var volume = Math.abs(trade.volume % 100000000).toString()
			while (volume.length < 8) {
				volume = '0' + volume;
			}
			volume = Math.abs(~~(trade.volume / 100000000)).toString() + '.' + volume;
			while (volume.length < 15) {
				volume = ' ' + volume;
			}
			trade_line = '[' + timestamp + ']' + price + volume;
			if (ask_line.length > 34) {
				ask_line = '----------------------------------';
			}
		}
		process.stdout.write(bid_line + '    ' + ask_line + '    ' + trade_line + '\n');
	}
	process.stdout.write('                                                                                                  \n');
}

function load_depth(timeoutDelay) {
	if (load_depth_timeoutId != null) {
		clearTimeout(load_depth_timeoutId);
	}
	load_depth_timeoutId = null;
	https.get({host: 'mtgox.com', path: '/api/1/BTCUSD/public/depth', headers: {'Accept-Encoding': 'gzip', 'User-Agent': 'HELLO, WORLD!'}}, function(response) {
		if (response.statusCode != 200) {
			load_depth_timeoutId = setTimeout(load_depth, 5000, timeoutDelay);
			return;
		}
		if (response.headers['content-encoding'] != 'gzip') {
			load_depth_timeoutId = setTimeout(load_depth, 5000, timeoutDelay);
			return;
		}
		var body = '';
		response.pipe(zlib.createGunzip()).on('data', function(chunk) {
			body += chunk;
		}).on('end', function() {
			var depth = JSON.parse(body);
			if (depth.result != 'success') {
				load_depth_timeoutId = setTimeout(load_depth, 5000, timeoutDelay);
				return;
			}
			var timestamp = -Infinity;
			var _bids = {};
			for (var x in depth.return.bids) {
				var bid = depth.return.bids[x];
				if (parseInt(bid.stamp) > timestamp) {
					timestamp = parseInt(bid.stamp);
				}
				_bids[parseInt(bid.price_int)] = {timestamp: parseInt(bid.stamp), volume: parseInt(bid.amount_int)};
				if (bids[parseInt(bid.price_int)] == undefined || bids[parseInt(bid.price_int)].timestamp < parseInt(bid.stamp)) {
					bids[parseInt(bid.price_int)] = _bids[parseInt(bid.price_int)];
				}
			}
			var _asks = {}
			for (var x in depth.return.asks) {
				var ask = depth.return.asks[x];
				if (parseInt(ask.stamp) > timestamp) {
					timestamp = parseInt(ask.stamp);
				}
				_asks[parseInt(ask.price_int)] = {timestamp: parseInt(ask.stamp), volume: parseInt(ask.amount_int)};
				if (asks[parseInt(ask.price_int)] == undefined || asks[parseInt(ask.price_int)].timestamp < parseInt(ask.stamp)) {
					asks[parseInt(ask.price_int)] = _asks[parseInt(ask.price_int)];
				}
			}
			for (var price in bids) {
				if (_bids[price] == undefined && bids[price].timestamp <= timestamp) {
					delete bids[price];
				}
			}
			for (var price in asks) {
				if (_asks[price] == undefined && asks[price].timestamp <= timestamp) {
					delete asks[price];
				}
			}
			print();
			load_depth_timeoutId = setTimeout(load_depth, timeoutDelay, timeoutDelay);
		});
	}).on('error', function(error) {
		load_depth_timeoutId = setTimeout(load_depth, 5000, timeoutDelay);
	});
}

function load_trades(timeoutDelay) {
	if (load_trades_timeoutId != null) {
		clearTimeout(load_trades_timeoutId);
	}
	load_trades_timeoutId = null;
	https.get({host: 'mtgox.com', path: '/api/1/BTCUSD/public/trades', headers: {'Accept-Encoding': 'gzip', 'User-Agent': 'HELLO, WORLD!'}}, function(response) {
		if (response.statusCode != 200) {
			load_trades_timeoutId = setTimeout(load_trades, 5000, timeoutDelay);
			return;
		}
		if (response.headers['content-encoding'] != 'gzip') {
			load_trades_timeoutId = setTimeout(load_trades, 5000, timeoutDelay);
			return;
		}
		var body = '';
		response.pipe(zlib.createGunzip()).on('data', function(chunk) {
			body += chunk;
		}).on('end', function() {
			var trades = JSON.parse(body);
			if (trades.result != 'success') {
				load_trades_timeoutId = setTimeout(load_trades, 5000, timeoutDelay);
				return;
			}
			for (var x in trades.return) {
				var trade = trades.return[x];
				recent_trades[trade.tid] = {timestamp: new Date(trade.date * 1000), price: parseInt(trade.price_int), volume: parseInt(trade.amount_int)};
			}
			print();
			load_trades_timeoutId = setTimeout(load_trades, timeoutDelay, timeoutDelay);
		});
	}).on('error', function(error) {
		load_trades_timeoutId = setTimeout(load_trades, 5000, timeoutDelay);
	});
}

var socket = io.connect('https://socketio.mtgox.com/mtgox', {'reconnection limit': 10000, 'max reconnection attempts': Infinity});
socket.on('message', function(message) {
	switch (message.channel) {
	case '24e67e0d-1cad-4cc0-9e7a-f8523ef460fe':
		switch (message.op) {
		case 'subscribe':
			load_depth(60000);
			break;
		case 'private':
			switch (message.depth.type_str) {
			case 'bid':
				if (bids[parseInt(message.depth.price_int)] == undefined || bids[parseInt(message.depth.price_int)].timestamp <= parseInt(message.depth.now)) {
					bids[parseInt(message.depth.price_int)] = {timestamp: parseInt(message.depth.now), volume: parseInt(message.depth.total_volume_int)};
					print();
				}
				break;
			case 'ask':
				if (asks[parseInt(message.depth.price_int)] == undefined || asks[parseInt(message.depth.price_int)].timestamp <= parseInt(message.depth.now)) {
					asks[parseInt(message.depth.price_int)] = {timestamp: parseInt(message.depth.now), volume: parseInt(message.depth.total_volume_int)};
					print();
				}
				break;
			default:
			}
			break;
		default:
		}
		break;
	case 'dbf1dee9-4f2e-4a08-8cb7-748919a71b21':
		switch (message.op) {
		case 'subscribe':
			load_trades(60000);
			break;
		case 'private':
			recent_trades[message.trade.tid] = {timestamp: new Date(message.trade.date * 1000), price: parseInt(message.trade.price_int), volume: parseInt(message.trade.amount_int)};
			print();
			break;
		default:
		}
		break;
	default:
	}
}).on('disconnect', function() {
	load_depth(10000);
	load_trades(10000);
});

process.stdout.write('\x1b[H\x1b[2J');
load_depth(10000);
load_trades(10000);
