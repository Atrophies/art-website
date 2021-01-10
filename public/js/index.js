/* global commonmark: false, parseContent: false */
const minTimeToShow = 250;//ms

const db = firebase.firestore();

// to quote, smart: if true, straight quotes will be made curly, -- will be changed to an en dash, --- will be changed to an em dash, and ... will be changed to ellipses.
let parser = new commonmark.Parser({smart: true});
let renderer = new commonmark.HtmlRenderer({softbreak: "<br/>"});
const markdownToHTML = html => {
    return renderer.render(parser.parse(html));
};

const app = new Vue({
    el: 'article',
    methods: {
        goto: function(path){
            history.pushState(path, "", path);
            processNewURL(path);
            return false;
        },
        parseMd: function(md){
            return markdownToHTML(md);
        }
    },
    data: {
        artwork: [],
        category: [],
        art: null
    }
});


onpopstate = onload = onhashchange = () => {
    processNewURL(location.pathname);
};

onclick = e => {
    let a = e.path.filter(elem => elem.nodeName === "A");
    if (e.target.nodeName === "A" && e.target.origin === location.origin) {
        history.pushState({page: e.target.pathname}, "", e.target.pathname);
        processNewURL(e.target.pathname);
        return false;
    } else if (a.length) {
        open(a[0].href);
        return false;
    }
};

const fetchUser = async userId => (await db.collection("users").doc(userId).get()).data();

const fetchArtwork = async (categoryId, artId) => (await db.collection("categories").doc(categoryId).collection("artwork").doc(artId).get()).data();

const processCategoryDoc = async doc => {
    const ourArtwork = await doc.ref.collection("artwork").get();
    if(ourArtwork && !ourArtwork.empty){
        return {
            categoryName: doc.data().category,
            categoryId: doc.id,
            artwork: ourArtwork.docs.map(art => Object.assign(art.data(), {id: art.id}))
        };
    }
};

const fetchCategory = async categoryId => {
    const categoryDoc = await db.collection("categories").doc(categoryId).get();

    return processCategoryDoc(categoryDoc);
};

const fetchAllArtwork = async () => {
    const categories = (await db.collection("categories").get());
    if(categories && !categories.empty){
        const proms = [];
        categories.docs.forEach(doc => proms.push(processCategoryDoc(doc)));

        return Promise.all(proms);
    }
};

const processNewURL = async path => {
    if(path.startsWith("/")) path = path.slice(1);
    if(path.endsWith("/")) path = path.slice(0, -1);

    app.artwork = [];
    app.art = null;
    app.category = [];

    if(path === ""){
        const artwork = await fetchAllArtwork();
        console.log(artwork);

        app.artwork = artwork;
    }else if(path.startsWith("category/")){
        const split = path.split("/");
        const categoryId = split[1];
        if(split.length === 2) {
            const categoryArt = await fetchCategory(categoryId);
            console.log(categoryArt);


            app.category = categoryArt;
        }else if (split.length === 4 && split[2] === "artwork"){
            const artworkId = split[3];

            const art = await fetchArtwork(categoryId, artworkId);

            app.art = art;
        }
    }
};

// const processNewURL = path => {
//     console.log("Loading", path);
//     const timestampAtStart = Date.now();
//
//     document.querySelectorAll(".content").forEach(elem => elem.classList.remove("show"));
//     path = location.pathname || "/";
//     if (path === "/") {
//         path += "index";
//     } else if (path[path.length - 1] === "/") {
//         path = path.slice(0, -1);
//     }
//     const contentURL = location.origin + "/content" + path + ".md";
//     fetch(contentURL).then(resp => {
//         if (resp.ok) {
//             if (resp.headers.get("Content-Type") && resp.headers.get("Content-Type").startsWith("text/html")) {
//                 return fetch(location.origin + "/content/404.md").then(resp => resp.text());
//             }
//             return resp.text();
//         } else {
//             throw new Error("Not ok response");
//         }
//     }).then(text => {
//
//         // this converts the markdown file into a 2-dimensional array.
//         // ex.
//         // `{{{article}}}
//         // ## content
//         // content
//         // {{{aside}}}
//         // ## aside
//         // content`
//         // turns into
//         // [["article", "## content\ncontent"], ["aside", "## aside\ncontent"]]
//         let parsed = parseContent(text);
//
//         let delay = 0;
//         const difference = Date.now() - timestampAtStart;
//
//         if (difference < minTimeToShow) {
//             delay = minTimeToShow - difference;
//             console.log("Network request took", difference, "ms. Pausing for", delay, "ms in order to meet the minimum of", minTimeToShow, "ms");
//         }
//
//         // if the response is really quick (presumably cached locally), then wait a bit before showing
//         setTimeout(() => {
//             parsed.forEach(([id, ...contentNodes]) => {
//                 let elems = document.getElementById(id) ? [document.getElementById(id)] : document.querySelectorAll("[data-id=\"" + id + "\"]");
//                 if (!elems) {
//                     console.error("Unknown id", id);
//                 }
//                 elems.forEach(elem => {
//                     if (!elem.getAttribute("content")) elem.innerText = "";
//                     contentNodes.forEach(node => {
//                         if (typeof node === "string") {// a text node
//                             if (elem.getAttribute("content")) {// some elements get their content set
//                                 elem.setAttribute("content", node.trim());
//                             } else {
//                                 if (elem.parentNode.nodeName.toLowerCase() === "head") {
//                                     elem.appendChild(document.createTextNode(node));
//                                 } else {
//                                     elem.insertAdjacentHTML("beforeend", markdownToHTML(node));
//
//                                     // the above is not instant for some reason???
//                                     setTimeout(() => {
//                                         const lastElement = elem.children[elem.children.length - 1];
//                                         // we don't wanna put a paragraph inside a heading, so take the inner html out, put that in the heading, and remove the paragraph
//                                         if (elem.hasAttribute("data-no-para") && lastElement.tagName.toLowerCase() === "p") {
//                                             elem.insertAdjacentHTML("beforeend", lastElement.innerHTML);
//                                             lastElement.remove();
//                                         }
//                                     }, 0);
//                                 }
//                             }
//                         } else {
//                             let iframe, scriptElem;
//                             switch (node.type.toLowerCase()) {
//                                 case "kaembed":
//                                     iframe = document.createElement("iframe");
//                                     iframe.setAttribute("src", location.origin + "/__sandboxer.html?" + node.data);
//                                     iframe.setAttribute("width", "401");
//                                     iframe.setAttribute("height", "401");
//                                     setTimeout(() => elem.appendChild(iframe), 0);
//                                     break;
//                                 case "script":
//                                     scriptElem = document.createElement("script");
//                                     scriptElem.src = node.data;
//                                     elem.appendChild(scriptElem);
//                                     break;
//                                 case "asciinemaembed":
//                                     scriptElem = document.createElement("script");
//                                     scriptElem.src = `https://asciinema.org/a/${node.data}.js`;
//                                     scriptElem.setAttribute("id", `asciicast-${node.data}`);
//                                     elem.appendChild(scriptElem);
//                                     break;
//                                 default:
//                                     throw new Error(`Unknown special node ${node.type}`);
//                             }
//                             console.log(node);
//                         }
//                     });
//                 });
//             });
//         }, delay);
//
//         setTimeout(() => document.querySelectorAll(".content").forEach(elem => elem.classList.add("show")), 250);
//     });
// };


// if you attempt to access this site via a non-hash path, replace the current state with that
if (location.pathname !== "/") {
    history.replaceState({page: location.pathname}, "", location.pathname);
}
