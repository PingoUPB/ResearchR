// Auto-grow the Abstract textarea.
autosize(document.querySelector('#abstract'));

// a global object for some state variables
let $state = {
    get accepted() { return this.selectedOption == null ? null : this.selectedOption.startsWith("YES") },
    selectedOption: null,
    journal: null,
    title: null,
    authors: null,
    abstract: null,
    notes: null,
    get id() { return this.currentDbObject._id },
    get url() { return this.currentDbObject.url },
    get currentDbObject() { return this.allDbObjects[this.currentIndex].doc },
    set currentDbObject(_) { this.currentIndex = this.allDbObjects.findIndex(o => o.doc === _) },
    get totalSize() { return this.allDbObjects.length },
    get pendingObjects() { return this.allDbObjects.filter(o => o.doc.selectedOption == null).length },
    currentIndex: 0,
    allDbObjects: [],
    loading: false
};

(function ($) {
    "use strict";

    $state.loading = true;

    // Database stuff:
    const pouchOptions = {size: 50};
    const DB_NAME = 'researchr_db';

    let db = new PouchDB(DB_NAME, pouchOptions);

    let loadDbObjects = () => {
        db.allDocs({
            include_docs: true
        }).then((result) => {
            // $state.totalSize = result.total_rows;
            $state.allDbObjects = result.rows;
            console.debug("Successfully loaded the browser database.");
            setCurrentIndex(0);
            $state.loading = false;
            if($state.totalSize > 0){
                $("#exportBtn").show();
                const indexWithFirstUnprocessed = $state.allDbObjects.findIndex(o => o.doc.accepted == null);
                if(indexWithFirstUnprocessed !== -1){
                    setCurrentIndex(indexWithFirstUnprocessed);
                }
            } else {
                $("#exportBtn").hide();
            }
        }).catch((err) => {
            console.error(err);
        });
    };

    let addToDb = (csvEntry) => {
        let getGuid = () =>
            'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,
                (c) => {
                    let r = Math.random() * 16|0, v = c == 'x' ? r : (r&0x3|0x8);
                    return v.toString(16);
                });

        let dbEntry = {
            _id: csvEntry.Id || csvEntry.ID || csvEntry.id || getGuid(),
            title: csvEntry.Title,
            authors: csvEntry.Authors,
            journal: csvEntry.Source,
            abstract: csvEntry.Abstract,
            accepted: csvEntry.Accepted,
            selectedOption: csvEntry.SelectedOption,
            notes: csvEntry.Notes,
            url: csvEntry.ArticleURL,
            publisher: csvEntry.Publisher,
            year: csvEntry.Year
        };

        if(dbEntry.url == null || dbEntry.url.trim() === ""){
            //console.error(`Entry without URL found: ${csvEntry}`);
            return Promise.resolve(null);
        } else {
            return db.put(dbEntry).then((response) => {
                return response;
            }).catch((err) => {
                console.error(err);
                return null;
            });
        }
    };

    let updateToDb = (entry) => {
        return db.put(entry).then((response) => {
            //console.log(response);
            return response;
        }).catch((err) => {
            console.error(err);
        });
    };

    let exportDbAsCsv = () => {
        let exportObjects = $state.allDbObjects.map((dbObj) => ({
                Id: dbObj.doc._id,
                Title: dbObj.doc.title,
                Authors: dbObj.doc.authors,
                Source: dbObj.doc.journal,
                Abstract: dbObj.doc.abstract,
                ArticleURL: dbObj.doc.url,
                Publisher: dbObj.doc.publisher,
                Year: dbObj.doc.year,
                Accepted: dbObj.doc.accepted,
                SelectedOption: dbObj.doc.selectedOption,
                Notes: dbObj.doc.notes
            }) );
        let csvString = $.csv.fromObjects(exportObjects);
        let blob = new Blob([csvString], {
            type: "text/csv;charset=utf-8"
        });
        saveAs(blob, `researchR_export${new Date().toISOString().replace(/:/g, ".")}.csv`);
    };

    // Load DB at startup:

    loadDbObjects();



    // UI <-> State and Syncing:

    let updateStateFromUI = () => {
      $state.selectedOption = $("[name='notSuitableRadios']:checked").val();
      $state.journal = $("#journal").val();
      $state.title = $("#title").val();
      $state.authors = $("#authors").val();
      $state.abstract = $("#abstract").val();
      $state.notes = $("#notes").val();
    };

    let updateStateFromDB = () => {
        const currentDbObj = $state.currentDbObject;
        $state.selectedOption = currentDbObj.selectedOption;
        $state.journal = currentDbObj.journal;
        $state.title = currentDbObj.title;
        $state.authors = currentDbObj.authors;
        $state.abstract = currentDbObj.abstract;
        $state.notes = currentDbObj.notes;
    };

    let updateUIFromState = () => {
        $("#journal").val($state.journal);
        $("#title").val($state.title);
        $("#authors").val($state.authors);
        $("#abstract").val($state.abstract);
        $("#notes").val($state.notes);

        $("[name='notSuitableRadios']").prop("checked", false);
        if($state.selectedOption != null){
            $("[name='notSuitableRadios']").filter(`[value='${$state.selectedOption}']`).prop("checked", true);
        }

        $("#docId").text($state.id);
        $("#docIndex").text($state.currentIndex + 1);
        $("#docTotal").text($state.totalSize);
        $("#docLink").attr("href", $state.url);
        $("#pendingCount").text($state.pendingObjects);

        if($("iframe").attr("src") !== $state.url){
            $("iframe").attr("src", $state.url);
        }
    };

    let setCurrentIndex = (idx) => {
        if(idx >= 0 && idx < $state.totalSize){
            $state.currentIndex = idx;
            updateStateFromDB();
            updateUIFromState();
            updateUI(false);
        } else {
            console.error("setCurrentIndex called with invalid index: " + idx);
        }
    };

    let reactToChangedAcceptance = () => { // changes transparency and makes abstract required if accepted
        if($state.accepted === true){
            $(".not-accepted").css("opacity", "0.7");
            $(".accepted").css("opacity", "1");
            $("#abstract").attr("required", true);
        } else if($state.accepted === false) {
            $(".not-accepted").css("opacity", "1");
            $(".accepted").css("opacity", "0.7");
            $("#abstract").attr("required", false);
        }
    };

    let updateUI = (withUpdate = true) => {
        if($state.loading){
            return false;
        }

        if(withUpdate){
            updateStateFromUI();
        }
        reactToChangedAcceptance();
    };

    // UI Handlers

    $("form").change(() => {
        updateUI(true);
    });

    $("form").submit((e) => {
        updateStateFromUI();
        let currentDbEntry = $state.currentDbObject;
        currentDbEntry.journal = $state.journal;
        currentDbEntry.title = $state.title;
        currentDbEntry.authors = $state.authors;
        currentDbEntry.abstract = $state.abstract;
        currentDbEntry.notes = $state.notes;
        currentDbEntry.selectedOption = $state.selectedOption;
        currentDbEntry.accepted = $state.accepted;
        e.preventDefault();
        return updateToDb(currentDbEntry).then((response) => {
            setCurrentIndex($state.currentIndex + 1);
            return response;
        });
    });

    $("#backBtn").click(() => {
        setCurrentIndex($state.currentIndex - 1);
        return false;
    });

    $("#nextBtn").click(() => {
        setCurrentIndex($state.currentIndex + 1);
        return false;
    });

    $("#exportBtn").click(() => {
        exportDbAsCsv();
        return false;
    });

    $("#title, #abstract, #notes").focus(() => {
        $("[name='notSuitableRadios']").prop("checked", false);
        $("[name='notSuitableRadios']:last").prop("checked", true);
        updateUI();
    });

    // CSV Reading:

    let handleCsvSelect = (evt) => {
        let files = evt.target.files; // FileList object
        let file = files[0];

        if(file != null){
            readFile(file);
        }
    };

    let importToDb = (entries) => {
        $state.loading = true;
        db.destroy(DB_NAME).then(() =>{ // delete and recreate to delete old entries
            db = new PouchDB(DB_NAME, pouchOptions);
            console.log("Recreated DB...");

            for(let entry of entries){
                addToDb(entry);
            }
            setTimeout(() => {
                setCurrentIndex(0);
                $state.loading = false;
            }, 1500);
        });
    };

    let readFile = (file) => {
        let reader = new FileReader();
        reader.readAsText(file);
        reader.onload = function(event){
            let csv = event.target.result;

            // convert all line endings to linux style
            csv = csv.replace(/\r\n|\r|\n/g, "\r\n");

            let data;
            try {
                console.debug("1st try: parsing CSV with ,");
                data = $.csv.toObjects(csv);
            } catch (e) {
                // try ; as delimiter if parsing with , failed.
                console.debug("2nd try: parsing CSV with ;");
                data = $.csv.toObjects(csv, {separator: ";"});
            }
            if(data != null){
                importToDb(data);
                alert(`OK!\nImportierte Einträge: ${data.length}`);
            } else {
                alert("Unable to parse the CSV file.");
            }
        };
        reader.onerror = () => alert('Unable to read ' + file.fileName);
    };

    let performClick = (elemId) => {            // https://stackoverflow.com/a/6463467/238931
        let elem = document.getElementById(elemId);
        if(elem && document.createEvent) {
            let evt = document.createEvent("MouseEvents");
            evt.initEvent("click", true, false);
            elem.dispatchEvent(evt);
        }
    };

    $("#csvFileInput").change(handleCsvSelect);

    $("#csvButton").click(() => performClick("csvFileInput"));

    // Error handling and other stuff:

    document.querySelector("iframe").onload = () => { // might not fire in some browsers
        try {
            document.querySelector("iframe").contentDocument;
            $("#iframe-error").hide();
        }
        catch(err){
            console.error(err);
            $("#iframe-error").show();
        }
    }


})(jQuery);
