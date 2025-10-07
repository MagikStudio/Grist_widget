let currentoptions = [];
let allRecords = [];
let sessionID = "";
let column = "";

// Affiche / masque la zone d'erreur
function showError(msg) {
  const el = document.getElementById('error');
  if (!msg) {
    el.style.display = 'none';
    el.innerHTML = '';
  } else {
    el.innerHTML = msg;
    el.style.display = 'block';
  }
}

// Récupère la sélection sauvegardée (retourne un tableau de strings)
function restoreSelectionFromSession(uniqoptions) {
  if (!sessionID) return [];
  const raw = sessionStorage.getItem(sessionID + "_Dropdownfilter_Item");
  if (raw === null) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map(v => String(v)).filter(v => uniqoptions.includes(String(v)));
    }
    if (typeof parsed === 'string' && uniqoptions.includes(parsed)) {
      return [parsed];
    }
  } catch (e) {
    // fallback si raw est juste une string
    if (raw.length > 0 && uniqoptions.includes(raw)) return [raw];
  }
  return [];
}

// Met à jour la liste de cases (checkboxes)
function updateCheckboxList(options) {
  const normalized = Array.isArray(options)
    ? options.filter(opt => opt !== null && opt !== undefined).map(opt => String(opt))
    : [];
  const uniqoptions = Array.from(new Set(normalized)).sort();

  // On remplace l'élément <select> par une div de checkboxes (sans modifier HTML source)
  const orig = document.getElementById('dropdown');
  const container = document.createElement('div');
  container.id = 'checkbox-list';
  container.style.overflowY = 'auto';
  container.style.height = '100%';
  container.style.boxSizing = 'border-box';
  container.style.padding = '4px';

  // restaurer sélection si possible
  let currentSelections = restoreSelectionFromSession(uniqoptions);

  // si pas de sélection et orig avait selection(s), essayer de les lire (cas d'un re-render)
  if (currentSelections.length === 0 && orig && orig.selectedOptions && orig.selectedOptions.length > 0) {
    currentSelections = Array.from(orig.selectedOptions).map(o => String(o.value)).filter(v => v !== '' && uniqoptions.includes(v));
  }

  if (uniqoptions.length === 0) {
    const p = document.createElement('div');
    p.textContent = 'No options available';
    container.appendChild(p);
    replaceNode(orig, container);
    grist.setSelectedRows(null);
    return;
  }

  // case "Tout sélectionner"
  const topLabel = document.createElement('label');
  topLabel.style.display = 'block';
  topLabel.style.marginBottom = '6px';
  topLabel.style.fontSize = '13px';
  const topInput = document.createElement('input');
  topInput.type = 'checkbox';
  topInput.id = 'checkbox-select-all';
  topInput.style.marginRight = '6px';
  topLabel.appendChild(topInput);
  const topText = document.createTextNode('Tout sélectionner / Tout désélectionner');
  topLabel.appendChild(topText);
  container.appendChild(topLabel);

  topInput.addEventListener('change', function(e) {
    const checked = e.target.checked;
    const inputs = container.querySelectorAll('input[type="checkbox"].value-checkbox');
    inputs.forEach(inp => {
      inp.checked = checked;
    });
    // récupérer valeurs cochées et appliquer
    const vals = Array.from(inputs).filter(i => i.checked).map(i => i.value);
    selectRows(vals);
  });

  // Liste des options en checkbox
  uniqoptions.forEach(opt => {
    const label = document.createElement('label');
    label.style.display = 'block';
    label.style.userSelect = 'none';
    label.style.cursor = 'pointer';
    label.style.marginBottom = '4px';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'value-checkbox';
    input.value = String(opt);
    input.style.marginRight = '6px';

    if (currentSelections.includes(String(opt))) {
      input.checked = true;
    }

    input.addEventListener('change', function() {
      // Mettre à jour l'état du select-all (si tous cochés -> coché, sinon décoché)
      const allInputs = container.querySelectorAll('input[type="checkbox"].value-checkbox');
      const checkedInputs = Array.from(allInputs).filter(i => i.checked);
      topInput.checked = (checkedInputs.length === allInputs.length && allInputs.length > 0);
      // appliquer la sélection
      const selectedValues = checkedInputs.map(i => String(i.value));
      selectRows(selectedValues);
    });

    label.appendChild(input);
    const span = document.createElement('span');
    span.textContent = String(opt);
    label.appendChild(span);

    container.appendChild(label);
  });

  // régler le checkbox "select all" selon la sélection initiale
  const allInputsNow = container.querySelectorAll('input[type="checkbox"].value-checkbox');
  const checkedNow = Array.from(allInputsNow).filter(i => i.checked);
  topInput.checked = (checkedNow.length === allInputsNow.length && allInputsNow.length > 0);

  replaceNode(orig, container);

  // appliquer sélection initiale
  if (currentSelections.length === 0) {
    selectRows([]);
  } else {
    selectRows(currentSelections);
  }

  currentoptions = [''].concat(uniqoptions);
}

// remplace node existant par nodeNew
function replaceNode(oldNode, newNode) {
  if (!oldNode || !oldNode.parentNode) {
    // si l'élément select a été retiré, on attache au container principal
    const root = document.getElementById('container');
    if (root) {
      // retirer tout ce qui porte l'id "checkbox-list" précédent s'il existe
      const prev = document.getElementById('checkbox-list');
      if (prev) prev.remove();
      root.insertBefore(newNode, document.getElementById('error'));
    }
    return;
  }
  oldNode.parentNode.replaceChild(newNode, oldNode);
}

// Sauvegarde l'option sessionid dans la config du widget
function saveOption() {
  const sid = document.getElementById("sessionid").value || "";
  if (grist && grist.widgetApi && typeof grist.widgetApi.setOption === 'function') {
    grist.widgetApi.setOption('sessionid', sid);
  } else if (grist && typeof grist.setOption === 'function') {
    grist.setOption('sessionid', sid);
  } else {
    console.warn('setOption API not available on grist object');
  }
}

// initialisation Grist
function initGrist() {
  if (!window.grist) {
    showError('Grist API not available');
    return;
  }

  grist.ready({
    columns: [{ name: "OptionsToSelect", title: 'Options to select', type: 'Any' }],
    requiredAccess: 'read table',
    allowSelectBy: true,
    onEditOptions() {
      document.getElementById("container").style.display = 'none';
      document.getElementById("config").style.display = '';
      document.getElementById("sessionid").value = sessionID || '';
    },
  });

  grist.onOptions((customOptions, _) => {
    customOptions = customOptions || {};
    sessionID = customOptions.sessionid || "";
    document.getElementById("container").style.display = '';
    document.getElementById("config").style.display = 'none';
  });

  grist.onRecords(function (records, mappings) {
    if (!records || records.length === 0) {
      showError("No records received");
      updateCheckboxList([]);
      grist.setSelectedRows(null);
      return;
    }

    allRecords = records;
    column = mappings && mappings.OptionsToSelect;
    const mapped = grist.mapColumnNames(records);

    showError("");
    const options = mapped
      .map(record => record.OptionsToSelect)
      .filter(option => option !== null && option !== undefined);

    if (options.length === 0) {
      showError("No valid options found");
    }
    updateCheckboxList(options);
  });
}

// sélection des lignes correspondantes — accepte string, array ou vide
function selectRows(value) {
  let values = [];
  if (value == null) {
    values = [];
  } else if (Array.isArray(value)) {
    values = value.map(v => String(v)).filter(v => v !== '');
  } else {
    values = String(value).length > 0 ? [String(value)] : [];
  }

  if (values.length === 0) {
    grist.setSelectedRows(null);
    if (sessionID.length > 0) sessionStorage.setItem(sessionID + "_Dropdownfilter_Item", JSON.stringify([]));
    return;
  }

  if (!Array.isArray(allRecords) || !column) {
    grist.setSelectedRows(null);
    return;
  }

  const valsSet = new Set(values);
  const rows = allRecords
    .filter((item) => {
      const itemVal = item && item[column] !== undefined && item[column] !== null ? String(item[column]) : '';
      return valsSet.has(itemVal);
    })
    .map(({id}) => id);

  if (sessionID.length > 0) sessionStorage.setItem(sessionID + "_Dropdownfilter_Item", JSON.stringify(values));
  grist.setSelectedRows(rows);
}

// uniq (toujours renvoyer tableau)
function uniq(a) {
  if (!Array.isArray(a)) return [];
  return Array.from(new Set(a.filter(x => x !== null && x !== undefined && String(x).length > 0)));
}

document.addEventListener('DOMContentLoaded', initGrist);
