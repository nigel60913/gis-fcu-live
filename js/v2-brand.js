const replaceText = (root = document.body) => {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  nodes.forEach((node) => {
    if (node.nodeValue?.includes("全員互動")) {
      node.nodeValue = node.nodeValue.replaceAll("全員互動", "ESG x MM");
    }
  });
};

const applyBrand = () => {
  replaceText();
  document.title = document.title.replace("GIS.FCU Live", "ESG x MM Live");
  document.querySelectorAll(".topbar .title").forEach((el) => {