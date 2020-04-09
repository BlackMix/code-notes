import { ToastProgrammatic as Toast } from 'buefy';
import db from '@/datastore-notes';
import mysql from '@/mysql';
import converter from '@/converter';
import { Octokit } from '@octokit/rest';
import path from 'path';
// eslint-disable-next-line import/no-extraneous-dependencies
import { remote } from 'electron';
import packageJson from '../../../../package';

const connect = (store) => {
  const { mysqlHost, mysqlDB, mysqlUser, mysqlPassword } = store.rootState.Settings.database;
  return mysql.createConnection({
    host: mysqlHost,
    user: mysqlUser,
    password: mysqlPassword,
    database: mysqlDB,
  });
};

const getOctokit = ({ githubPersonalAccessToken, githubEnterpriseUrl }) => new Octokit({
  requestMedia: 'application/vnd.github.v3+json',
  auth: githubPersonalAccessToken,
  headers: { userAgent: 'code-notes'.concat(packageJson.version),
    'user-agent': 'octokit/rest.js v1.2.3',
    mediaType: {
      format: 'application/vnd.github.v3+json',
    } },
  ...(githubEnterpriseUrl && { baseUrl: githubEnterpriseUrl }),
});

const state = {
  notes: [],
  languageSelected: 'all',
  selected: '',
  isLoading: false,
};

const mutations = {
  LOAD_NOTES(state, notes) {
    state.languageSelected = 'all';

    state.notes = notes;
  },
  ADD_NOTE(state, note) {
    state.notes.push(note);
  },
  DELETE_NOTE(state, note) {
    if (state.selected === 'gist') {
      state.notes = state.notes.filter(n => n.id !== note.id);
    } else {
      state.notes = state.notes.filter(n => n._id !== note._id);
    }
    state.languageSelected = 'all';
  },
  SELECT_LANGUAGE(state, language) {
    state.languageSelected = language;
  },
  SELECT(state, select) {
    state.selected = select;
  },
  SELECT_LOADING(state, loading) {
    state.isLoading = loading;
  },
};

const actions = {
  loadNotes(store) {
    store.commit('LOAD_NOTES', []);
    store.commit('SELECT_LOADING', true);
    switch (store.getters.selected) {
      default: db.find({}, (err, notes) => {
        if (!err) {
          store.commit('LOAD_NOTES', notes);
          actions.writeNotesToFS(notes);
          store.commit('SELECT_LOADING', false);
        }
      }); break;
      case 'gist': if (store.rootState.Settings.settings.githubPersonalAccessToken) {
        const octokit = getOctokit(store.rootState.Settings.settings);

        octokit.gists.list().then((res) => {
          const promises = [];

          res.data.forEach((gist) => {
            promises.push(octokit.gists.get({ gist_id: gist.id }));
          });

          Promise.all(promises).then((values) => {
            const notes = [];

            values.forEach((gistDetailed) => {
              notes.push(converter.gistToNote(gistDetailed.data));
            });

            store.commit('LOAD_NOTES', notes);
            store.commit('SELECT_LOADING', false);
          });
        });
      } break;
      case 'mysql': connect(store).query('SELECT id,note FROM `notes`', (err, rows) => {
        if (err) {
          connect(store).end(() => {});
          store.commit('SELECT_LOADING', false);
          Toast.open({
            duration: 5000,
            message: `Error on connect: ${err.code}`,
            position: 'is-bottom-right',
            type: 'is-danger',
          });
          return;
        }
        const results = [];
        rows.forEach((v) => {
          results.push(Object.assign({}, { id: v.id }, JSON.parse(v.note)));
        });
        if (rows) {
          store.commit('LOAD_NOTES', results);
          store.commit('SELECT_LOADING', false);
          connect(store).end(() => {});
        } else {
          store.commit('LOAD_NOTES', []);
          store.commit('SELECT_LOADING', false);
        }
        connect(store).end(() => {});
      }); break;
    }
  },
  addNote(store, note) {
    store.commit('SELECT_LOADING', true);
    if (store.state.selected === 'gist') {
      const octokit = getOctokit(store.rootState.Settings.settings);
      octokit.gists.create(note).then(() => {
        store.dispatch('loadNotes');
      });
    }
    if (store.state.selected === 'mysql') {
      connect(store).query('INSERT INTO notes SET note=?', JSON.stringify(note), (err) => {
        if (err) {
          connect(store).end();
          store.commit('SELECT_LOADING', false);
          return;
        }

        store.dispatch('loadNotes');
      });
      connect(store).end();
      store.commit('ADD_NOTE', note);
      store.commit('SELECT_LOADING', false);
      return;
    }
    if (store.state.selected === 'local' || !store.state.selected) {
      db.insert(note, (err, note) => {
        if (!err) {
          store.commit('ADD_NOTE', note);
          store.commit('SELECT_LOADING', false);
        }
      });
      actions.writeFileToFS(note, false);
    }
  },
  convertToGist(store, note) {
    const octokit = getOctokit(store.rootState.Settings.settings);
    return octokit.gists.create(converter.noteToGist(note));
  },
  updateNote(store, note) {
    store.commit('SELECT_LOADING', true);
    if (store.state.selected === 'gist') {
      const octokit = getOctokit(store.rootState.Settings.settings);

      octokit.gists
        .update({
          gist_id: note.id,
          files: note.files,
          description: note.description,
        })
        .then(() => store.dispatch('loadNotes'));
    } else {
      if (store.state.selected === 'mysql') {
        connect(store).query('UPDATE notes SET note = ? WHERE id = ?', [JSON.stringify(note), note.id], (err) => {
          if (err) {
            connect(store).end();
            store.commit('SELECT_LOADING', false);
            return;
          }

          store.dispatch('loadNotes');
        });
        connect(store).end();
        store.commit('SELECT_LOADING', false);
        return;
      }

      db.update({ _id: note._id }, note, {}, (err) => {
        if (!err) {
          store.dispatch('loadNotes');
        }
      });
      actions.writeFileToFS(note, true);
    }
  },
  deleteNote(store, note) {
    store.commit('SELECT_LOADING', true);

    const octokit = getOctokit(store.rootState.Settings.settings);

    if (store.state.selected === 'gist') {
      octokit.gists.delete({ gist_id: note.id }).then(() => {
        store.commit('DELETE_NOTE', note);
        store.commit('SELECT_LOADING', false);
      });
    } else {
      if (store.state.selected === 'mysql') {
        connect(store).query('DELETE FROM notes WHERE id = ?', note.id, (err) => {
          if (err) {
            connect(store).end();
            store.commit('SELECT_LOADING', false);
            return;
          }

          store.commit('DELETE_NOTE', note);
          store.dispatch('loadNotes');
        });
        connect(store).end();
        store.commit('SELECT_LOADING', false);
        return;
      }

      db.remove({ _id: note._id }, {}, (err) => {
        if (!err) {
          store.commit('DELETE_NOTE', note);
          store.commit('SELECT_LOADING', false);
        }
      });
      actions.deleNoteFromFS(note);
    }
  },
  writeNotesToFS(notes) {
    notes.forEach((note) => {
      actions.writeFileToFS(note, true);
    });
  },
  writeFileToFS(note, updateIfExists) {
    const fs = require('fs-extra');
    const notesDir = path.join(remote.app.getPath('userData'), 'notes');

    // Create folder for current note
    const curNoteDir = path.join(notesDir, `${note.name}-${note.createdAt.getTime()}`);
    if (!fs.existsSync(curNoteDir)) {
      fs.ensureDirSync(curNoteDir);
    }

    // Write each file to filesystem
    Object.entries(note.files).forEach((file) => {
      const fileName = `${file[1].name}.${file[1].language}`;
      if (updateIfExists || !fs.exists(fileName)) {
        fs.writeFileSync(path.join(curNoteDir, fileName), file[1].content, 'utf-8');
      }
    });

    // Write metadata to filesystem
    fs.writeFileSync(path.join(curNoteDir, 'metadata.json'), JSON.stringify({
      description: note.description,
      public: note.public,
      updatedAt: note.updatedAt,
      createdAt: note.createdAt,
      tags: note.tags,
    }), 'utf-8');
  },
  deleNoteFromFS(note) {
    const fs = require('fs-extra');
    const curNoteDir = path.join(remote.app.getPath('userData'), 'notes', `${note.name}-${note.createdAt.getTime()}`);
    fs.removeSync(curNoteDir);
  },
  selectLanguage(store, language) {
    store.commit('SELECT_LANGUAGE', language);
  },
  select(store, select) {
    store.commit('SELECT', select);
  },
};

const getters = {
  notes: state => state.notes,
  noteById: state => id => state.notes.find(note => note._id === id),
  languages: (state) => {
    const map = new Map();

    if (state.notes.length > 0) {
      state.notes.forEach((note) => {
        Object.keys(note.files).forEach((key) => {
          if (map.has(note.files[key].language)) {
            map.set(
              note.files[key].language,
              map.get(note.files[key].language) + 1,
            );
          } else {
            map.set(note.files[key].language, 1);
          }
        });
      });
    }
    return map;
  },
  totalFiles() {
    let total = 0;

    state.notes.forEach((note) => {
      total += Object.keys(note.files).length;
    });

    return total;
  },
  languageSelected: state => state.languageSelected,
  selected: state => state.selected,
  isLoading: state => state.isLoading,
};

export default {
  state,
  mutations,
  actions,
  getters,
};
