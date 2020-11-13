/* global commonmark: false, parseContent: false */
const minTimeToShow = 250;//ms

let parser = new commonmark.Parser();
let renderer = new commonmark.HtmlRenderer({softbreak: "<br/>"});
const markdownToHTML = html => {
    return renderer.render(parser.parse(html));
};

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

const processNewURL = path => {
    console.log("Loading", path);
    const timestampAtStart = Date.now();

    document.querySelectorAll(".content").forEach(elem => elem.classList.remove("show"));
    path = location.pathname || "/";
    if (path === "/") {
        path += "index";
    } else if (path[path.length - 1] === "/") {
        path = path.slice(0, -1);
    }
    const contentURL = location.origin + "/content" + path + ".md";
    fetch(contentURL).then(resp => {
        if (resp.ok) {
            if (resp.headers.get("Content-Type") && resp.headers.get("Content-Type").startsWith("text/html")) {
                return fetch(location.origin + "/content/404.md").then(resp => resp.text());
            }
            return resp.text();
        } else {
            throw new Error("Not ok response");
        }
    }).then(text => {

        // this converts the markdown file into a 2-dimensional array.
        // ex.
        // `{{{article}}}
        // ## content
        // content
        // {{{aside}}}
        // ## aside
        // content`
        // turns into
        // [["article", "## content\ncontent"], ["aside", "## aside\ncontent"]]
        let parsed = parseContent(text);

        let delay = 0;
        const difference = Date.now() - timestampAtStart;

        if (difference < minTimeToShow) {
            delay = minTimeToShow - difference;
            console.log("Network request took", difference, "ms. Pausing for", delay, "ms in order to meet the minimum of", minTimeToShow, "ms");
        }

        // if the response is really quick (presumably cached locally), then wait a bit before showing
        setTimeout(() => {
            parsed.forEach(([id, ...contentNodes]) => {
                let elems = document.getElementById(id) ? [document.getElementById(id)] : document.querySelectorAll("[data-id=\"" + id + "\"]");
                if (!elems) {
                    console.error("Unknown id", id);
                }
                elems.forEach(elem => {
                    if (!elem.getAttribute("content")) elem.innerText = "";
                    contentNodes.forEach(node => {
                        if (typeof node === "string") {// a text node
                            if (elem.getAttribute("content")) {// some elements get their content set
                                elem.setAttribute("content", node.trim());
                            } else {
                                if (elem.parentNode.nodeName.toLowerCase() === "head") {
                                    elem.appendChild(document.createTextNode(node));
                                } else {
                                    elem.insertAdjacentHTML("beforeend", markdownToHTML(node));
                                }
                            }
                        } else {
                            let iframe, scriptElem;
                            switch (node.type.toLowerCase()) {
                                case "kaembed":
                                    iframe = document.createElement("iframe");
                                    iframe.setAttribute("src", location.origin + "/__sandboxer.html?" + node.data);
                                    iframe.setAttribute("width", "401");
                                    iframe.setAttribute("height", "401");
                                    setTimeout(() => elem.appendChild(iframe), 0);
                                    break;
                                case "script":
                                    scriptElem = document.createElement("script");
                                    scriptElem.src = node.data;
                                    elem.appendChild(scriptElem);
                                    break;
                                case "asciinemaembed":
                                    scriptElem = document.createElement("script");
                                    scriptElem.src = `https://asciinema.org/a/${node.data}.js`;
                                    scriptElem.setAttribute("id", `asciicast-${node.data}`);
                                    elem.appendChild(scriptElem);
                                    break;
                                default:
                                    throw new Error(`Unknown special node ${node.type}`);
                            }
                            console.log(node);
                        }
                    });
                });
            });
        }, delay);

        setTimeout(() => document.querySelectorAll(".content").forEach(elem => elem.classList.add("show")), 250);
    });
};


// if you attempt to access this site via a non-hash path, replace the current state with that
if (location.pathname !== "/") {
    history.replaceState({page: location.pathname}, "", location.pathname);
}
