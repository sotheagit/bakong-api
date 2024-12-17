const express = require('express');
const { BakongKHQR, khqrData, MerchantInfo } = require('bakong-khqr');
const axios = require('axios');
const bodyParser = require('body-parser');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas'); // For QR code with center icon

const app = express();
const port = 3008;
const baseUrl = 'https://api-bakong.nbc.gov.kh/v1/check_transaction_by_md5';

// Array of access tokens
const accessTokens = [
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkYXRhIjp7ImlkIjoiNTM0MWQwMmFlZmViNDU3In0sImlhdCI6MTcyNzkzODU5MywiZXhwIjoxNzM1NzE0NTkzfQ.v6rD-_BKMOrEZGSfiZNeBX-0urqApvBf4FZR1n4F41Y'
];

// Function to get a random token from the array
function getRandomToken() {
    const randomIndex = Math.floor(Math.random() * accessTokens.length);
    return accessTokens[randomIndex];
}

app.use(bodyParser.json());

function logTransaction(tran) {
    const logFilePath = path.join(__dirname, 'tran.log');
    
    if (!fs.existsSync(logFilePath)) {
        fs.writeFileSync(logFilePath, ''); // Create an empty log file
    }

    const logData = fs.readFileSync(logFilePath, 'utf-8');
    const logs = logData.split('\n').filter(Boolean);
    if (logs.includes(tran)) {
        return false; // Transaction already exists
    }
    fs.appendFileSync(logFilePath, tran + '\n');
    return true;
}

// Route to generate and return KHQR code with a center icon
app.all('/generateQR', async (req, res) => {
    const amount = parseFloat(req.query.amount || req.body.amount);
    const bakongAccountID = req.query.bakongAccountID || req.body.bakongAccountID;
    const merchantName = req.query.merchantName || req.body.merchantName;

    if (isNaN(amount) || !bakongAccountID || !merchantName) {
        return res.status(400).json({ error: 'Invalid amount, Bakong account ID, or merchant name' });
    }

    const allowedIDs = ['sotheasok@aclb', 'nimol_nhen@trmc', 'sao_meas@aclb', 'rithsender@aclb', 'rithsender@trmc', 'chhunlichhean_kun@wing', 'ouch_nhel@trmc', 'meng_vathana1@aclb'];
    if (!allowedIDs.includes(bakongAccountID)) {
        return res.status(403).json({ error: 'Unauthorized Bakong account ID. Contact admin: t.me/sothea54' });
    }

    const billNumber = generateBillNumber();

    const optionalData = {
        currency: khqrData.currency.usd,
        amount,
        billNumber,
        storeLabel: "cambotopup",
    };

    function generateBillNumber() {
        return "NV" + Math.floor(100000000000 + Math.random() * 900000000000);
    }

    const merchantInfo = new MerchantInfo(
        bakongAccountID,
        merchantName,
        "Phnom Penh",
        "tg:@cambo_teamkh",
        "Bakong Bank",
        optionalData
    );

    const khqr = new BakongKHQR();
    const response = khqr.generateMerchant(merchantInfo);

    const responseData = {
    qr: response.data.qr,
    md5: response.data.md5,
    tran: billNumber,
    merchantName: merchantName, // Add merchantName to response
    amount: amount              // Add amount to response
    };


    if (!logTransaction(responseData.tran)) {
        return res.status(400).json({ error: 'Transaction already exists.' });
    }

    try {
        const qrImagePath = path.join(__dirname, 'image', `${billNumber}.png`);
        const canvas = createCanvas(400, 400);
        const ctx = canvas.getContext('2d');

        await QRCode.toCanvas(canvas, responseData.qr, { width: 400, margin: 1 });

        const icon = await loadImage('https://checkout.payway.com.kh/images/usd-khqr-logo.svg');
        const iconSize = 80;
        const x = (canvas.width - iconSize) / 2;
        const y = (canvas.height - iconSize) / 2;
        ctx.drawImage(icon, x, y, iconSize, iconSize);

        const buffer = canvas.toBuffer('image/png');
        fs.writeFileSync(qrImagePath, buffer);

        responseData.qr = `${req.protocol}://${req.headers.host}/qr/${billNumber}`;
        res.json(responseData);
    } catch (error) {
        console.error('Error generating QR code:', error.message);
        res.status(500).json({ error: 'Failed to generate QR code image' });
    }
});

// Route to check transaction status by MD5
app.all('/check_transaction', async (req, res) => {
    const md5 = req.query.md5 || req.body.md5;

    if (!md5) {
        return res.status(400).json({ error: 'MD5 parameter is required' });
    }

    const token = getRandomToken();

    try {
        const response = await axios.post(baseUrl, { md5 }, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        res.json(response.data);
    } catch (error) {
        console.error('Error checking transaction status:', error.message);
        res.status(500).json({ error: 'Failed to check transaction status' });
    }
});

// Route to get QR code image by billNumber
app.get('/qr/:billNumber', (req, res) => {
    const billNumber = req.params.billNumber;
    const qrImagePath = path.join(__dirname, 'image', `${billNumber}.png`);

    if (fs.existsSync(qrImagePath)) {
        res.sendFile(qrImagePath);
    } else {
        res.status(404).json({ error: 'QR code image not found' });
    }
});

// Start the server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
