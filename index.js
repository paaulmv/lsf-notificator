const jar = require('request').jar();
const rp = require('request-promise').defaults({
    simple: false,
    resolveWithFullResponse: true,
    jar,
    headers: {
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'accept-language': 'de,en;q=0.9,de-DE;q=0.8,en-DE;q=0.7,en-US;q=0.6',
        'cache-control': 'max-age=0',
        priority: 'u=0, i',
        'sec-ch-ua': '"Not(A:Brand";v="99", "Google Chrome";v="133", "Chromium";v="133"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'same-origin',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1',
        'Referrer-Policy': 'strict-origin-when-cross-origin'
    }
});
const cheerio = require('cheerio');
const fs = require('fs');
require('dotenv').config();

const examResults = [];

async function getToken() {
    try {
        const response = await rp({
            uri: 'https://lsf.hft-stuttgart.de/qisserver/rds?state=user&type=1&category=auth.login&startpage=portal.vm&breadCrumbSource=portal',
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                Referer: 'https://lsf.hft-stuttgart.de/qisserver/rds?state=user&type=0'
            },
            form: {
                asdf: process.env.USER,
                fdsa: process.env.PASSWORD,
                submit: 'Anmelden'
            },
            method: 'POST',
            followAllRedirects: true
        });
        console.log(response.statusCode, response.headers);
    } catch (error) {
        console.error('Error during request:', error.message);
    }
}

async function getAsi() {
    try {
        const response = await rp({
            uri: 'https://lsf.hft-stuttgart.de/qisserver/rds?state=change&type=1&moduleParameter=studyPOSMenu&nextdir=change&next=menu.vm&subdir=applications&xml=menu&purge=y&navigationPosition=functions%2CstudyPOSMenu&breadcrumb=studyPOSMenu&topitem=functions&subitem=studyPOSMenu',
            headers: {
                Referer:
                    'https://lsf.hft-stuttgart.de/qisserver/rds?state=user&type=0&category=menu.browse&breadCrumbSource=portal&startpage=portal.vm&chco=y'
            }
        });
        console.log(response.statusCode, response.headers);

        const $ = cheerio.load(response.body);
        const notenLink = $('.liste .auflistung').last().attr('href').trim();
        const asi = notenLink.split('asi=')[1];
        console.log('asi: ', asi);

        return asi;
    } catch (error) {
        console.error('Error during request:', error.message);
    }
}

async function getExamResults(asi) {
    try {
        const response = await rp({
            uri: `https://lsf.hft-stuttgart.de/qisserver/rds?state=notenspiegelStudent&next=list.vm&nextdir=qispos/notenspiegel/student&createInfos=Y&struct=auswahlBaum&nodeID=auswahlBaum%7Cabschluss%3Aabschl%3D84%2Cstgnr%3D1&expand=0&asi=${asi}#auswahlBaum%7Cabschluss%3Aabschl%3D84%2Cstgnr%3D1`,
            headers: {
                Referer: `https://lsf.hft-stuttgart.de/qisserver/rds?state=notenspiegelStudent&next=tree.vm&nextdir=qispos/notenspiegel/student&menuid=notenspiegelStudent&breadcrumb=notenspiegel&breadCrumbSource=menu&asi=${asi}`
            }
        });
        console.log(response.statusCode, response.headers);

        // fs.writeFileSync('examResults.html', response.body);
        // console.log('Exam results saved to examResults.html');

        const $ = cheerio.load(response.body);
        $('table tr').each((index, element) => {
            const prüfungsNr = $(element).find('td:nth-child(1)').text().trim();
            const moduleName = $(element).find('td:nth-child(2)').text().trim();
            const semester = $(element).find('td:nth-child(3)').text().trim();
            const grade = $(element).find('td:nth-child(4)').text().trim();
            const versuch = $(element).find('td:nth-child(8)').text().trim();

            if (moduleName && versuch !== '' && grade) {
                if (
                    !examResults.find(
                        result => result.prüfungsNr === prüfungsNr && result.semester === semester
                    )
                ) {
                    console.log('New Result:', prüfungsNr, semester, moduleName, grade);

                    examResults.push({ prüfungsNr, moduleName, semester, grade });
                    sendTelegramMessage(`Neue Note eingetragen: ${moduleName}: ${grade}`);
                }
            }
        });
    } catch (error) {
        console.error('Error during request:', error.message);
    }
}

async function sendTelegramMessage(message) {
    await rp({
        method: 'POST',
        uri: `https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`,
        form: {
            chat_id: process.env.CHAT_ID,
            text: message
        }
    });
}

(async () => {
    await getToken();
    const asi = await getAsi();

    setInterval(async () => {
        await getExamResults(asi);
    }, 1000 * 10);
})();
