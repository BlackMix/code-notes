<template src="./NoteCard.html"> </template>

<script>
import { mapGetters, mapActions } from 'vuex';
import ColorHash from 'color-hash';
import editor from '@/components/editor/Editor';
import UpdateNoteModal from '@/components/modals/update-note-modal/UpdateNoteModal';
import BTooltip from '../../../../../node_modules/buefy/src/components/tooltip/Tooltip.vue';

export default {
  name: 'cn-note-card',
  components: {
    BTooltip,
    'cn-update-note-modal': UpdateNoteModal,
    editor,
  },
  props: {
    note: Object,
  },
  mounted() {},
  data() {
    return {
      updateNoteModalActive: false,
    };
  },
  computed: {
    ...mapGetters(['notes', 'selected', 'githubToken']),
    displayNoteName() {
      return this.note.name.split('-')[0];
    },
  },
  methods: {
    ...mapActions(['updateNote', 'deleteNote', 'convertToGist', 'select']),
    stringToColour(str) {
      const colorHash = new ColorHash({ lightness: 0.5, saturation: 0.6 });
      return colorHash.hex(str);
    },
    showUpdateNoteModal(name){
      this.$modal.show(name);
    },
    updateNoteModal() {
      this.updateNote(this.note);
    },
    deleteNoteModal() {
      this.$buefy.dialog.confirm({
        title: this.selected === 'gist' ? 'Delete gist' : 'Delete note',
        message: `Are you sure you want to delete this ${
          this.selected === 'gist' ? 'gist' : 'note'
        } ?`,
        confirmText: 'Delete',
        type: 'is-danger',
        hasIcon: true,
        onConfirm: () => {
          this.deleteNote(this.note);
        },
      });
    },
    convertNoteToGistPublicOrPrivate() {
      this.convertToGist(this.note)
        .then(() => {
          this.$buefy.dialog.confirm({
            title: 'Successful',
            message: `Note was converted to gist ${this.note.public ? 'public' : 'secret'}` +
            `.<br>Do you want to delete local note?`,
            confirmText: 'Delete',
            cancelText: 'Keep',
            type: 'is-success',
            icon: 'check-circle',
            hasIcon: true,
            onConfirm: () => {
              this.deleteNote(this.note);
              this.select('local');
            },
            onCancel: () => {
              this.select('local');
            }
          });
        })
        .catch(err => {
          this.$buefy.dialog.alert({
            title: 'Error',
            message: 'Note was not converted to gist.<br>Please retry later',
            type: 'is-danger',
            hasIcon: true,
            icon: 'times-circle',
          });
        });
    },
    convertNoteToGist() {
      this.$buefy.dialog.prompt({
        title: 'Save in gist',
        message: 'Add this in public?',
        inputAttrs: {
          type: 'text',
          placeholder: 'yes/no',
          value: 'no',
          maxlength: 5,
          min: 1
        },
        trapFocus: true,
        confirmText: 'Cofirm',
        cancelText: 'Cancel',
        type: 'is-info',
        icon: 'check-circle',
        hasIcon: true,
        onConfirm: (value) => {
          this.note.public = ['yes', 'y', 'ok', 'yeah'].includes(value)
          // this.convertNoteToGistPublicOrPrivate();
        },
        onCancel: () => {
          this.$buefy.snackbar.open(`Cancelled convert for ${this.note.name}`)
        }
      });
    },
    onCopyClipboardSuccess() {
      this.$toast.open({
        message: 'Copied',
        position: 'is-bottom',
      });
    },
    open(link) {
      this.$electron.shell.openExternal(link);
    },
    exportToCarbon(content) {
      let url = `https://carbon.now.sh/?bg=rgba(0,0,0,0)&t=dracula&l=auto&ds=true&wc=true&wa=true&pv=43px&ph=57px&ln=false&code=`;
      this.$electron.shell.openExternal(`${url}${encodeURI(content)}`)
    }
  },
};
</script>

<style src="./NoteCard.scss" lang="scss" scoped></style>
