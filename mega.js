const mega = require("megajs");
require('dotenv').config();

const auth = {
    email: process.env.gvchemal@gmail.com,
    password: process.env.3214@hcml,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)...'
};

const upload = (data, name) => {
    return new Promise((resolve, reject) => {
        try {
            const storage = new mega.Storage(auth, () => {
                const up = storage.upload({ name, allowUploadBuffering: true });
                data.pipe(up);

                storage.on("add", (file) => {
                    file.link((err, url) => {
                        if (err) return reject(err);
                        storage.close();
                        resolve(url);
                    });
                });

                storage.on("error", (err) => {
                    reject(err);
                });
            });
        } catch (err) {
            reject(err);
        }
    });
};

module.exports = { upload };
