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

// Met à jour le dropdown avec des options uniques (sécurisé) et prend en charge la multi-sélection
function updateDropdown(options) {
  // normalise en chaînes, filtre null/undefined et déduplique via Set
  const normalized = Array.isArray(options)
    ? options.filter(opt => opt !== null && opt !== undefined).map(opt => String(opt))
    : [];
  const uniqoptions = Array.from(new Set(normalized)).sort();

  const dropdown = document.getElementById('dropdown');

  // s'assurer que le select est en mode multiple
  dropdown.multiple = true;
  // optionnel: définir un nombre de lignes visibles
  dropdown.size = Math.min(Math.max(4, uniqoptions.length), 12);

  // récupérer sélection courante (peut être multiple)
  let currentSelections = [];
  // si dropdown a déjà une sélection valide => la garder
  if (dropdown && dropdown.selectedOptions && dropdown.selectedOptions.length > 0) {
    currentSelections = Array.from(dropdown.selectedOptions).map(opt => String(opt.value)).filter(v => v !== '');
  }

  // si pas de sélection et sessionID => tenter restore depuis sessionStorage (defensif)
  if ((currentSelections.length === 0) && sessionID.length > 0) {
    const raw = sessionStorage.getItem(sessionID + "_Dropdownfilter_Item");
    if (raw !== null) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          // garder seulement les valeurs encore présentes dans options
          currentSelections = parsed.filter(v => uniqoptions.includes(String(v))).map(v => String(v));
        } else if (typeof parsed === 'string' && parsed.length > 0 && uniqoptions.includes(parsed)) {
          currentSelections = [parsed];
        }
      } catch (e) {
        // fallback: raw may be a string
        if (raw.length > 0 && uniqoptions.includes(raw)) currentSelections = [raw];
      }
    }
  }

  // rebuild options
  dropdown.innerHTML = '';

  if (uniqoptions.length === 0) {
    const optionElement = document.createElement('option');
    optionElement.value = '';
    optionElement.textContent = 'No options available';
    dropdown.appendChild(optionElement);
    grist.setSelectedRows(null);
    return;
  }

  // ajouter une option vide en tête pour "aucune sélection"
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '-- none --';
  dropdown.appendChild(placeholder);

  uniqoptions.forEach((option) => {
    const optionElement = document.createElement('option');
    optionElement.value = String(option);
    optionElement.textContent = String(option);
    if (currentSelections.includes(String(option))) {
      optionElement.selected = true;
    }
    dropdown.appendChild(optionElement);
  });

  // appliquer la sélection (vide ou multiple)
  if (currentSelections.length === 0) {
    dropdown.value = '';
    selectRows([]); // clear selection
  } else {
    // s'assurer que les options sélectionnées sont appliquées (browser gère selected attrib)
    selectRows(currentSelections);
  }

  currentoptions = [''].concat(uniqoptions);
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
      updateDropdown([]);
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
    updateDropdown(options);
  });

  // changement sur le select : peut être multiple
  document.getElementById('dropdown').addEventListener('change', function(event) {
    const sel = event && event.target ? event.target : null;
    if (!sel) return;
    // selectedOptions est une collection
    const selectedValues = Array.from(sel.selectedOptions).map(opt => String(opt.value)).filter(v => v !== '');
    selectRows(selectedValues);
  });
}

// sélection des lignes correspondantes — accepte string, array ou vide
function selectRows(value) {
  // normaliser value en tableau
  let values = [];
  if (value == null) {
    values = [];
  } else if (Array.isArray(value)) {
    values = value.map(v => String(v)).filter(v => v !== '');
  } else {
    values = String(value).length > 0 ? [String(value)] : [];
  }

  if (values.length === 0) {
    // clear selection
    grist.setSelectedRows(null);
    if (sessionID.length > 0) sessionStorage.setItem(sessionID + "_Dropdownfilter_Item", JSON.stringify([]));
    return;
  }

  if (!Array.isArray(allRecords) || !column) {
    grist.setSelectedRows(null);
    return;
  }

  // union des ids correspondant à n'importe quelle valeur
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

// fonction uniq plus robuste (on préfère Set)
function uniq(a) {
  if (!Array.isArray(a)) return [];
  return Array.from(new Set(a.filter(x => x !== null && x !== undefined && String(x).length > 0)));
}

document.addEventListener('DOMContentLoaded', initGrist);
