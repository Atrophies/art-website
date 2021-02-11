const fs = require("fs");
const path = require("path");
const crypto = require('crypto');

const sharp = require('sharp');
const admin = require("firebase-admin");

// width of the thumbnails
const thumbWidth = 500;

const sleep = ms => new Promise((resolve) => setTimeout(() => resolve(), ms));

const titleCase = str => str.split(" ").map(str => str.slice(0, 1).toUpperCase() + str.slice(1).toLowerCase()).join(" ");

const isImage = file => [".jpg", ".png", ".gif", ".jpeg", ".webp", ".tiff"].includes(path.extname(file).toLowerCase());
const isAudio = file => [".mp3", ".wav", ".aac", ".m4a"].includes(path.extname(file).toLowerCase());
const isVideo = file => [".mov", ".mp4", ".avi", ".wmv", ".ogg", ".webm"].includes(path.extname(file).toLowerCase());
const isDoc = file => [".pdf", ".doc", ".docx"].includes(path.extname(file).toLowerCase());

const serviceAccount = require("./service-account.json");
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: "shs-art-website.appspot.com"
});
const db = admin.firestore();
const bucket = admin.storage().bucket();

let categoryMappings = Object.create(null);
const addedDocIds = [];


async function upload(username, file){
    const title = file.split(".").slice(0, -1).join(".");
    const localFilePath = path.join("downloaded", username, file);

    const userFilePath = path.join("userdata", username, file);
    const thumbFilePath = path.join("thumb-" + thumbWidth, username, file);

    const url = await uploadFile(localFilePath, userFilePath);

    let thumbUrl;
    if(isImage(file)) {
        thumbUrl = await uploadFileThumbnail(localFilePath, thumbFilePath, thumbWidth);
    }

    let category = "Uncategorized";

    if(isImage(file)){
        category = "Visual";
    }
    if(isAudio(file)){
        category = "Music and Spoken Word";
    }
    if(isVideo(file)){
        category = "Video";
    }else if(file.includes("webm")){
        debugger;
    }
    if(isDoc(file)){
        category = "Document";
    }

    const userDoc = await db.collection("users").where("name", "==", titleCase(username)).get();
    let author;
    if(userDoc.empty){
        const doc = await db.collection("users").add({
            name: titleCase(username)
        });
        author = doc.id;
    }else{
        author = userDoc.docs[0].id;
    }

    let categoryId = categoryMappings[category];
    let madeNewDoc = false;


    if(!categoryId) {
        let categoryDoc = await db.collection("categories").where("category", "==", category).get();
        if (categoryDoc.empty) {
            madeNewDoc = true;
            categoryDoc = await db.collection("categories").add({category});
        }else{
            categoryDoc = categoryDoc.docs[0];
        }
        categoryId = categoryDoc.id;
    }
    if(categoryMappings[category] && madeNewDoc){// another call of this function made a document in between then and now
        // do NOT add an await here!
        categoryDoc.delete();
        categoryId = categoryMappings[category];
    }

    categoryMappings[category] = categoryId;

    const artworkRef = db.collection("categories").doc(categoryId).collection("artwork");

    const artworkDoc = await artworkRef.where("title", "==", title).get();
    const data = thumbUrl ? {
        author,
        authorName: titleCase(username),
        title,
        url,
        thumbUrl
    } : {
        author,
        authorName: titleCase(username),
        title,
        url
    };
    if(artworkDoc.empty){
        const doc = await artworkRef.add(data);
        addedDocIds.push(doc.id);
    }else{
        const docId = artworkDoc.docs[0].id;
        addedDocIds.push(docId);
        await artworkRef.doc(docId).update(data);
    }
}

async function checkIfNeedsUpload(localFile, destination){
    let needsUpload = false;

    let fileMetadata;
    try {
        const file = await bucket.file(destination).getMetadata();
        fileMetadata = file[0];

        const serverHash = fileMetadata.md5Hash;


        const hashBuilder = crypto.createHash("md5");

        hashBuilder.setEncoding("base64");
        hashBuilder.write(fs.readFileSync(localFile));
        hashBuilder.end();

        const hash = hashBuilder.read();

        if (hash !== serverHash) {
            console.warn(`${hash} != ${serverHash} for ${localFile}`);

            needsUpload = true;
        }
    } catch (e) {
        if (e.code !== 404) throw e;
        needsUpload = true;
    }

    return {fileMetadata, needsUpload};
}

async function uploadFile(localFile, destination) {
    let {needsUpload, fileMetadata} = await checkIfNeedsUpload(localFile, destination);

    if(needsUpload){
        const file = await bucket.upload(localFile, {
            destination: destination,
            metadata: {
                // Enable long-lived HTTP caching headers
                cacheControl: 'public, max-age=31536000',
            },
        });
        await file[0].makePublic();
        fileMetadata = file[0].metadata;
    }


    const url = fileMetadata.mediaLink;

    console.log(`\tuploaded ${localFile} to ${destination} ${url}`);

    return url;
}

async function uploadFileThumbnail(localFile, destination, imgWidth) {
    let fileMetadata;

    try {
        const buffer = await sharp(localFile).resize({width: imgWidth}).jpeg({quality: 90, force: true}).toBuffer();

        const file = bucket.file(destination);

        await file.save(buffer, {
            metadata: {
                // Enable long-lived HTTP caching headers
                cacheControl: 'public, max-age=31536000',
            }
        });

        await file.makePublic();
        fileMetadata = file.metadata;
    }catch (e) {
        if(e.code === "ECONNRESET"){
            await sleep(250);
            return uploadFileThumbnail(localFile, destination, imgWidth);
        }
    }

    const url = fileMetadata.mediaLink;

    console.log(`\tuploaded ${localFile} thumbnail to ${destination} ${url}`);

    return url;
}

const promises = [];

(async () => {
    for (const user of fs.readdirSync("downloaded")) {
        const userPath = path.join("downloaded", user);
        for (const file of fs.readdirSync(userPath)) {
            const userFilePath = path.join(userPath, file);
            await sleep(100);
            if (fs.statSync(userFilePath).isFile())
                promises.push(upload(user, file));
        }
    }


    await Promise.all(promises);

    const delPromises = [];
    console.log("added docs", addedDocIds);

    const categories = await db.collection("categories").get();
    for (const category of categories.docs) {
        const artworkDocs = await db.collection("categories").doc(category.id).collection("artwork").get();
        for (const artworkDoc of artworkDocs.docs) {
            if (!addedDocIds.includes(artworkDoc.id)) {
                console.log("Deleting " + artworkDoc.id);
                delPromises.push(
                    db.collection("categories").doc(category.id).collection("artwork").doc(artworkDoc.id).delete()
                );
            }
        }
    }

    await Promise.all(delPromises);
})();
