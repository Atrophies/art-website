(() => {
	const parseContent = text => {
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
		return text.split("\n").reduce((acc, line) => {
			line = line.trim();

			if(line.slice(0, 3) === "{{{" && line.slice(-3) === "}}}"){// a new root element, like {{{article}}}
				acc.push([line.slice(3, -3), ""]);
			}else{
				const lastArrayElement = acc[acc.length - 1];
				if(!lastArrayElement){
					return acc;
				}

				const addText = text => {
					if (typeof lastArrayElement[lastArrayElement.length - 1] === "string") {// if the most recent element in the array is a string, add to it
						lastArrayElement[lastArrayElement.length - 1] += "\n" + text;
					} else {// otherwise add a new text node
						lastArrayElement.push(text);
					}
				};

				if(line.includes("{{") && line.includes("}}")){// line requires special parsing
					const regex = /(.*?)(?:{{([^{}]+)}})+/y;
					let match;

					// yes, i want an assignment in a while condition
					// noinspection JSAssignmentUsedAsCondition
					while (match = regex.exec(line)) {// eslint-disable-line no-cond-assign
						const text = match[1];
						const specialNode = match[2];

						// if we grabbed text this match
						if (text) {
							addText(text);
						}

						// if we grabbed a special node this match
						if (specialNode) {
							const positionOfFirstSpace = specialNode.indexOf(" ");
							const specialObject = specialNode.slice(0, positionOfFirstSpace);
							const specialData = specialNode.slice(positionOfFirstSpace + 1);
							console.log(specialObject, specialData);
							lastArrayElement.push({type: specialObject, data: specialData});
						}
					}
				}else{
					addText(line);
				}
			}



			return acc;
		}, []);
	};

	// noinspection JSUnresolvedVariable
	if(typeof module !== "undefined"){
		// noinspection JSUnresolvedVariable
		module.exports = parseContent;// eslint-disable-line no-undef
	}else if(typeof window !== "undefined"){
		window.parseContent = parseContent;
	}
})();