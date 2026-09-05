/**
 * Layout components to standardize page structures.
 */

/**
 * Creates and renders a standardized page header and action bar.
 * @param {HTMLElement} container - The main container to append the header to.
 * @param {Object} options - Configuration for the header.
 * @param {string} options.title - The main title of the page.
 * @param {string} [options.description] - An optional subtitle/description.
 * @param {HTMLElement[]} [options.actions=[]] - An array of elements to place in the action bar.
 * @returns {HTMLElement} The created header element.
 */
export function createPageLayout(container, { title, description, actions = [] }) {
  const header = document.createElement('div');
  header.className = 'page-header-container';

  const titleContainer = document.createElement('div');

  const h1 = document.createElement('h1');
  h1.className = 'page-title';
  h1.textContent = title;
  titleContainer.appendChild(h1);

  if (description) {
    const p = document.createElement('p');
    p.className = 'page-description';
    p.textContent = description;
    titleContainer.appendChild(p);
  }

  const actionsContainer = document.createElement('div');
  actionsContainer.className = 'page-actions-container';

  actions.forEach(action => {
    actionsContainer.appendChild(action);
  });

  header.appendChild(titleContainer);
  header.appendChild(actionsContainer);

  container.appendChild(header);

  return header;
}
