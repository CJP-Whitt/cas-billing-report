var date = require('date-and-time');
var express = require('express');
var router = express.Router();
var request = require('request');
var json = require('json');
const { bdNetQuery } = require('../src/bd_queries');
const { bdCsvCreate } = require('../src/csv_modifier');

/* Session Variables */
// bdQuery - Holds the bd query repsonse
// bdCsv - Holds csv text data
// dbgTxt - Holds the debug text

/* GET home page. */
router.get('/', (req, res, next) => {
	req.session.bdQuery = req.session.bdQuery ? req.session.bdQuery : null;
	req.session.dbgTxt = req.session.dbgTxt ? req.session.dbgTxt : "";

	return res.render('index', {
		title: 'CAS Billing Report', 
		bdQuery: req.session.bdQuery,
		dbgTxt: req.session.dbgTxt,
		bdCsv: req.session.bdCsv
	});

});


router.get('/bdQuery', (req, res) => {
	bdNetQuery(req).then(data => {
		console.log('BD Query action DONE!\n');
		if (data){
			req.session.bdQuery = data;
			req.session.bdCsv = true;
		}else {
			req.session.bdQuery = null;
		}
		res.redirect('/');
	});
});

router.get('/bdCsvDownload', (req, res) => {
	let filename = 'BD Report ' + date.format(new Date(), 'MM-DD-YYYY') + '.csv';
	req.session.bdCsv = bdCsvCreate(req.session.bdQuery);
	res.set({'Content-Disposition': 'attachment; filename=' + filename,'Content-type': 'text/csv'});
	return res.send(req.session.bdCsv);
});

module.exports = router;
