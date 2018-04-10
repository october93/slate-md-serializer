import parser from "./parser";
import { Value } from "slate";
import { Record } from "immutable";
import { encode } from "./urls";

const String = new Record({
  kind: "string",
  text: ""
});

function formatLinkBar(img, url, title, desc, domain) {
  return `%%%
${img ? `${url}\n${img}` : url}
${title}
${desc.replace(/\[(.*?)\]/g, "")}
${domain}
%%%
`;
}

function formatSoftBreak(children) {
  return children.replace(/\n/g, "  \n");
}

/**
 * Rules to (de)serialize nodes.git pu
 *
 * @type {Object}
 */

let tableHeader = "";

const RULES = [
  {
    serialize(obj, children) {
      if (obj.kind === "string") {
        return `${children}`
          .replace(/\\/g, "\\\\")
          .replace(/@/g, "\\@")
          .replace(/!/g, "\\!")
          .replace(/\[/g, "\\[")
          .replace(/\]/g, "\\]")
          .replace(/%/g, "\\%");
      }
    }
  },
  {
    serialize(obj, children, document) {
      if (obj.kind !== "block") return;
      let parent = document.getParent(obj.key);

      switch (obj.type) {
        case "table":
          tableHeader = "";
          return children;
        case "table-head": {
          switch (obj.getIn(["data", "align"])) {
            case "left":
              tableHeader += "|:--- ";
              break;
            case "center":
              tableHeader += "|:---:";
              break;
            case "right":
              tableHeader += "| ---:";
              break;
            default:
              tableHeader += "| --- ";
          }
          return `| ${children} `;
        }
        case "table-row":
          let output = "";
          if (tableHeader) {
            output = `${tableHeader}|\n`;
            tableHeader = "";
          }
          return `${children}|\n${output}`;
        case "table-cell":
          return `| ${children} `;
        case "paragraph":
          if (parent.type === "list-item") {
            return formatSoftBreak(children);
          } else {
            return `\n${formatSoftBreak(children)}\n`;
          }
        case "code":
          return `\`\`\`\n${children}\n\`\`\`\n`;
        case "block-quote":
          return `> ${children}\n`;
        case "todo-list":
        case "bulleted-list":
        case "ordered-list":
          if (parent === document) {
            return `\n${children}`;
          }
          return `\n${children.replace(/^/gm, "   ")}`;
        case "list-item": {
          switch (parent.type) {
            case "ordered-list":
              return `1. ${formatSoftBreak(children)}\n`;
            case "todo-list":
              let checked = obj.getIn(["data", "checked"]);
              let box = checked ? "[x]" : "[ ]";
              return `${box} ${formatSoftBreak(children)}\n`;
            default:
            case "bulleted-list":
              return `* ${formatSoftBreak(children)}\n`;
          }
        }
        case "heading1":
          return `# ${formatSoftBreak(children)}`;
        case "heading2":
          return `## ${children}`;
        case "heading3":
          return `### ${children}`;
        case "heading4":
          return `#### ${children}`;
        case "heading5":
          return `##### ${children}`;
        case "heading6":
          return `###### ${children}`;
        case "heading6":
          return `###### ${children}`;
        case "horizontal-rule":
          return `---\n`;
        case "image":
          const alt = obj.getIn(["data", "alt"]);
          const src = encode(obj.getIn(["data", "src"]) || "");
          return `![${alt}](${src})\n`;
        case "linkbar":
          const img = encode(obj.getIn(["data", "image"]) || "");
          const url = encode(obj.getIn(["data", "url"]) || "");
          const title = obj.getIn(["data", "title"]);
          const desc = obj.getIn(["data", "description"]);
          const domain = obj.getIn(["data", "domain"]);

          return formatLinkBar(img, url, title, desc, domain);
      }
    }
  },
  {
    serialize(obj, children) {
      if (obj.kind !== "inline") return;
      switch (obj.type) {
        case "link":
          const href = encode(obj.getIn(["data", "href"]) || "");
          return `[${children.trim()}](${href})`;
        case "code-line":
          return `\`${children}\``;
        case "mention":
          const username = obj.getIn(["data", "username"]) || "";
          const anon = obj.getIn(["data", "anonymous"]) || "";
          return username && `${anon ? "!" : "@"}${username} `;
      }
    }
  },
  // Add a new rule that handles marks...
  {
    serialize(obj, children) {
      if (obj.kind !== "mark") return;
      switch (obj.type) {
        case "bold":
          return `**${children}**`;
        case "italic":
          return `*${children}*`;
        case "code":
          return `\`${children}\``;
        case "inserted":
          return `__${children}__`;
        case "deleted":
          return `~~${children}~~`;
      }
    }
  }
];

/**
 * Markdown serializer.
 *
 * @type {Markdown}
 */

class Markdown {
  /**
   * Create a new serializer with `rules`.
   *
   * @param {Object} options
   *   @property {Array} rules
   * @return {Markdown} serializer
   */

  constructor(options = {}) {
    this.rules = [...(options.rules || []), ...RULES];

    this.serializeNode = this.serializeNode.bind(this);
    this.serializeLeaves = this.serializeLeaves.bind(this);
    this.serializeString = this.serializeString.bind(this);
  }

  /**
   * Serialize a `state` object into an HTML string.
   *
   * @param {State} state
   * @return {String} markdown
   */

  serialize(state) {
    const { document } = state;
    const elements = document.nodes.map(node =>
      this.serializeNode(node, document)
    );

    const output = elements.join("\n");

    // trim beginning whitespace
    return output.replace(/^\s+/g, "");
  }

  /**
   * Serialize a `node`.
   *
   * @param {Node} node
   * @return {String}
   */

  serializeNode(node, document) {
    if (node.kind == "text") {
      const leaves = node.getLeaves();
      return leaves.map(this.serializeLeaves);
    }

    let children = node.nodes.map(node => this.serializeNode(node, document));
    children = children.flatten().length === 0
      ? ""
      : children.flatten().join("");

    for (const rule of this.rules) {
      if (!rule.serialize) continue;
      const ret = rule.serialize(node, children, document);
      if (ret) return ret;
    }
  }

  /**
   * Serialize `leaves`.
   *
   * @param {Leave[]} leaves
   * @return {String}
   */

  serializeLeaves(leaves) {
    const string = new String({ text: leaves.text });
    const text = this.serializeString(string);

    return leaves.marks.reduce((children, mark) => {
      for (const rule of this.rules) {
        if (!rule.serialize) continue;
        const ret = rule.serialize(mark, children);
        if (ret) return ret;
      }
    }, text);
  }

  /**
   * Serialize a `string`.
   *
   * @param {String} string
   * @return {String}
   */

  serializeString(string) {
    for (const rule of this.rules) {
      if (!rule.serialize) continue;
      const ret = rule.serialize(string, string.text);
      if (ret) return ret;
    }
  }

  /**
   * Deserialize a markdown `string`.
   *
   * @param {String} markdown
   * @return {State} state
   */
  deserialize(markdown) {
    const document = parser.parse(markdown);
    const state = Value.fromJSON({ document });
    return state;
  }
}

export default Markdown;
