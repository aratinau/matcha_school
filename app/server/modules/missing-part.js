var tagsToReplace = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;'
};

function replaceTag(tag) {
    return tagsToReplace[tag] || tag;
}

exports.htmlentities = function (str) {
    return str.replace(/[&<>]/g, replaceTag);
}

exports.isalphanumeric = function (str) {
	// retourne null si il y a un caractere qui n'est pas autorise
	return str.match('/^[a-z0-9]+$/i');
}
