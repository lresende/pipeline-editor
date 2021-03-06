/*
 * Copyright 2018-2021 Elyra Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { INode } from "./types";

// 3 seconds should be ample time.
// should only protect against any infinite loops.
const TIMEOUT = 3 * 1000;

export interface ILink {
  id: string;
  trgNodeId: string;
  srcNodeId: string;
  type: string;
}

export const checkCircularReferences = (links: ILink[]): string[] => {
  const startTime = Date.now();

  // filter out comment links.
  links = links.filter((l) => l.type !== "commentLink");

  // organize links into easily indexable map:
  // {srcNodeId: link[]}
  const linkMap: { [key: string]: ILink[] } = {};
  for (const l of links) {
    if (linkMap[l.srcNodeId] === undefined) {
      linkMap[l.srcNodeId] = [];
    }
    linkMap[l.srcNodeId].push(l);
  }

  let orderedChain: string[] = [];
  const taintedLinks = new Set<string>();
  const seen = new Set<string>();
  const stack: ILink[] = [];
  for (const l of links) {
    if (seen.has(l.id)) {
      continue;
    }
    seen.add(l.id);
    orderedChain = [];
    orderedChain.push(l.id);
    const linksToVisit = linkMap[l.trgNodeId];
    if (linksToVisit === undefined) {
      continue;
    }
    stack.push(...linksToVisit);
    const forkStack: number[] = [];

    const chainLength = orderedChain.length;
    forkStack.push(...linksToVisit.map(() => chainLength));

    while (0 < stack.length && Date.now() - startTime < TIMEOUT) {
      forkStack.pop();
      const l = stack.pop()!; // we should be gauranteed an item.
      seen.add(l.id);
      const seenLinkIndex = orderedChain.indexOf(l.id);

      // We hit a link we've already seen in the chain. This means there is a
      // cycle from the seen link to the end of the chain.
      if (seenLinkIndex > -1) {
        for (const item of orderedChain.slice(seenLinkIndex)) {
          taintedLinks.add(item);
        }

        const position = forkStack.pop();
        orderedChain = orderedChain.slice(0, position);
        continue;
      }

      orderedChain.push(l.id);

      const linksToVisit = linkMap[l.trgNodeId];

      // We reached the end of a chain.
      if (linksToVisit === undefined) {
        const position = forkStack.pop();
        orderedChain = orderedChain.slice(0, position);
        continue;
      }

      // Uncharted teritory, add it to the stack to be explored.
      stack.push(...linksToVisit);
      const chainLength = orderedChain.length;
      forkStack.push(...linksToVisit.map(() => chainLength));
    }
  }

  return [...taintedLinks];
};

export const validateProperties = (
  nodeDef: INode,
  node: any
): string | undefined => {
  const errors: string[] = [];
  for (const prop of nodeDef.properties?.parameters ?? []) {
    // this should be safe because a boolean can't be required
    // otherwise we would need to check strings for undefined or empty string
    if (prop.required && !node.app_data[prop.id]) {
      const label = nodeDef.properties?.uihints.parameter_info.find(
        (p) => p.parameter_ref === prop.id
      )?.label.default;
      errors.push(`property "${label}" is required`);
      continue;
    }
  }

  if (errors.length > 0) {
    return errors.join("\n");
  }
  return;
};
