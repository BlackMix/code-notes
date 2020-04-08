<template src="./SettingsModal.html"> </template>

<script>
import { mapGetters, mapActions } from 'vuex';

export default {
  name: 'cn-settings-modal',
  data() {
    return {
      newSettings: {},
      newDatabase: {},
      helpTokenModalActive: false,
    };
  },
  mounted() {
    this.$refs.githubPersonalAccessToken.focus();
    this.newSettings = { ...this.settings };
    this.newDatabase = { ...this.database };
  },
  methods: {
    ...mapActions(['setSettings', 'setDatabase']),
    save() {
      this.setSettings(this.newSettings);
      this.$modal.hide('settingsModalActive');
    },
    saveMysql() {
      this.setDatabase(this.newDatabase);
      this.$modal.hide('settingsModalActive');
    }
  },
  computed: {
    ...mapGetters(['settings', 'database']),
  },
};
</script>

<style src="./SettingsModal.scss" lang="scss"></style>
