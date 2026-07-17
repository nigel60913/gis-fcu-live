// 共用介面修正：避免後台 QR Code 重複，並統一活動段落名稱。
(function () {
  const OLD_LABEL = "全員互動";
  const NEW_LABEL = "ESG x MM";

  function replaceLabels(root = document.body) {
    if (!root) return;

    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    nodes.forEach((node) => {
      if (node.nodeValue && node.nodeValue.includes(OLD_LABEL)) {
        node.nodeValue = node.nodeValue.replaceAll(OLD_LABEL, NEW_LABEL);
      }
    });

    // option 沒有明確 value 時，顯示文字就是實