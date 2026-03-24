function parseScript(content) {
  const segments = [];
  const regex = /(\[[^\]]+\])/g;
  let lastIndex = 0;
  let segmentIndex = 0;
  let match;

  while ((match = regex.exec(content)) !== null) {
    // Takes text before placeholder e.g. "[Author Name]"
    if (match.index > lastIndex) {
      const text = content.slice(lastIndex, match.index).trim();
      if (text) {
        segments.push({ index: segmentIndex++, type: "static", text });
      }
    }
    
    // Push the placeholder text as a dynamic segment
    segments.push({
      index: segmentIndex++,
      type: "dynamic",
      text: match[0],  
    });
    lastIndex = match.index + match[0].length;
  }

  // Remaining text after last placeholder
  const tail = content.slice(lastIndex).trim();
  if (tail) {
    segments.push({ index: segmentIndex++, type: "static", text: tail });
  }

  return segments;
}

module.exports = { parseScript };