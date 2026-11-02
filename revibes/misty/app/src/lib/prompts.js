// The blending prompts from Appendix A.3 of the paper. Wording is kept; the only
// edits ask for strict JSON (the paper's format used backticks for updatedCode)
// so the response can be parsed through the bridge.
import { AVAILABLE_ICONS } from './icons.js';

const iconList = AVAILABLE_ICONS.join(', ');

const CHANGE_FORMAT = `Return result in the below format, make sure you use json. Return strict JSON: quote every key, and put updatedCode in a JSON string with newlines and quotes escaped:

{

"designExplanation": // explain the design of the screenshot image, focus on layout and color, be really concise, less than 30 words

"differences": // briefly summarize the differences between the reference image and the code, focus on layout orientation, spacing, color theme, font, etc.

"updatedCode": "() => {}" // return the whole component for the entire screen, with the updates;

// a list of objects listing the changes made, use the tailwind classes to indicate the changes

"categorizedChanges": [

{

"category": "", // summarize the category of the below changes, group changes together semantically, e.g. "Color: Changed light to dark theme", "Layout: Increased spacing between elements", "Visual details: Increased corner roundedness", "Image: Decreased image size", "Font: Changed font appearance", etc.

"changes": [{

"type": "color",

"before": // the tailwind class before the change,

"after": // the tailwind class after the change

}]

}

]

}

here is a good example of the changes field:

"categorizedChanges": [

{

"category": "Color: Changed light to dark theme",

"changes": [{

"type": "color",

"before": "bg-black",

"after": "bg-white"

}, {

"type": "color",

"before": "text-white",

"after": "text-gray-900"

}, {

"type": "border",

"before": "", // you can use empty before field to indicate addition of new classes

"after": "border-2 border-gray-300/90"

}, ...] // add as many as appropriate,

},

{

"category": "Font: Changed font appearance",

"changes": [{

"type": "color",

"before": "bg-black",

"after": "bg-white"

}, {

"type": "font",

"before": "text-sm",

"after": "text-lg"

}, ...] // add as many as appropriate,

},

]`;

const CODE_RULES = `- only use tailwind, react, and react icons. Follow the current code structure, do not include any import or export statements, just use a simple component definition () => {};

- when adding icons, pick from this list of lucide react icons, do not use others: ${iconList}

- there are a few stock photos for use under the folder /stock/, they are named after their orientation, like landscape0.jpg, landscape1.jpg, portrait0.jpg, etc. Do not use any other images. Do not use placeholder image paths.`;

const SUMMARY_RULE = `- Summarize the code changes in your response, use the format "categorizedChanges:" followed by a list of changes. Be very concise in your explanations. For example, "Color change: section titles, from green to purple"; "Layout change: adapted the layout for [add the feature description of the changed code piece]".`;

const variation = (attempt) =>
  attempt > 0
    ? `\n\nThis is regeneration attempt ${attempt}: make a noticeably different, equally valid design decision from the obvious first try.`
    : '';

// A.3.1 Global blending
export function globalBlendPrompt(code, attempt = 0) {
  return `Here is my react and tailwind code:

${code}

Help me create a new component page that blends the content of the above code with the visual style, layout, and appearance of the reference image. Change only the source code corresponding to this, and no other sections.

Preserve the content in the UI of the code, follow the layout and visual style of the reference image, optionally add more content where the original code's content cannot fill in all fields in the reference image's layout. Do not use content from the reference image, just use its layout and visual style.

A few rules:

- First, explain in concise language the design of the reference screenshot. Use it as a basis of your generation.

- Make sure all text is legible on the background

- Briefly summarize the differences between the reference image and the code, summarize them into a few categories of changes you want to make. Base your later generation of categorizedChanges based on these categories.

${CODE_RULES}

${SUMMARY_RULE}

${CHANGE_FORMAT}${variation(attempt)}`;
}

// A.3.2 Drag-and-drop blending
export function dropBlendPrompt({ code, aspects, custom, targetHtml, attempt = 0 }) {
  const named = aspects.filter((a) => a !== 'Customize');
  const described = [...named.map((a) => a.toLowerCase()), custom].filter(Boolean).join(', ');
  const attention = [...named, custom].filter(Boolean).join(' ');
  return `Here is my react and tailwind code:

${code}

blend the ${described} of the reference image into ${targetHtml}. Change sections of the source code corresponding to this, as well as sections that are of similar layout or screen position to this. For example, don't just apply to one element in a list, but apply to all list elements with similar layouts. Sometimes the specific code piece does not correspond to parts of the source code, because it's rendered HTML based on the source React code. In that case, you need to identify the original code pieces from the source and modify them.

A few rules:

- First, explain in concise language the layout of the reference screenshot. Use it as a basis of your generation.

- Make sure all text is legible on the background.

- Briefly summarize the differences between the reference image and the code, summarize them into a few categories of changes you want to make. Pay attention to ${attention}. Base your later generation of categorizedChanges based on these categories.

- Never directly pulls content from the reference to update the source code. For blending color and layout, preserve all original content in the UI for source code, only change/add the original content when it's really necessary for following a layout. When you blend in the addition mode, generate content based on the context of the source code.${
    named.includes('Content')
      ? '\n\n- Addition mode is on: add the selected UI element from the reference image at the location of the code above, with content that fits the source code.'
      : ''
  }

- Do not use list and .map functions to represent lists. Just generate HTML elements for each of the list items.

${CODE_RULES}

${SUMMARY_RULE}

- When creating a bottom navigation bar, use "absolute bottom-0" instead of "fixed bottom-0".

- Try to make colors and styles consistent and harmonious with the rest of the component.

${CHANGE_FORMAT}${variation(attempt)}`;
}

// Not in the paper: it says a toggle triggers another GPT-4o call but does not
// publish the prompt. Written for this revibe.
export function togglePrompt({ currentCode, originalCode, categories, switched }) {
  const lines = categories
    .map(
      (c) =>
        `- [${c.enabled ? 'ON' : 'OFF'}] ${c.label}: ${c.description}\n  class changes: ${c.changes
          .map((x) => `"${x.before}" -> "${x.after}"`)
          .join('; ')}`
    )
    .join('\n');
  return `Here is my react and tailwind code, the current version:

${currentCode}

It came from blending a reference design into this original code:

${originalCode}

The blend is described by these semantic changes, each switched ON or OFF by the user:

${lines}

${
    switched
      ? `The user just switched ${switched.enabled ? 'ON' : 'OFF'} "${switched.label}: ${switched.description}".`
      : 'The user just set several of these switches at once.'
  }

Update the current code so that every ON change is present and every OFF change is reverted to how the original code looked. Do not change anything else: keep all other styling, content and structure exactly as in the current code.

A few rules:

${CODE_RULES}

Return strict JSON: {"updatedCode": "() => {}"}, with the whole component for the entire screen in a JSON string, newlines and quotes escaped.`;
}

// Not in the paper: "Fix Render" appears in Figure 1 without a description.
export function fixRenderPrompt(code, error) {
  return `This react and tailwind component fails to render.

Code:

${code}

Error:

${error}

Repair the code with the smallest possible change, keeping its appearance and content.

A few rules:

${CODE_RULES}

Return strict JSON: {"updatedCode": "() => {}"}, with the whole component in a JSON string, newlines and quotes escaped.`;
}
