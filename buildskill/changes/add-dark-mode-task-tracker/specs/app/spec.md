# Dark Mode Task Tracker Specification

## Purpose

Define the observable behavior for the generated Dark Mode Task Tracker starter app.

## Requirements

### Requirement: Item Creation

The app SHALL allow users to add items from the main form.

#### Scenario: Valid item text
- GIVEN the user enters item text
- WHEN the user submits the form
- THEN the item appears in the list
- AND the total count increases

#### Scenario: Empty item text
- GIVEN the item input is empty
- WHEN the user submits the form
- THEN no item is added
- AND the current list remains unchanged

### Requirement: Local Persistence

The app SHALL save user-created items in browser localStorage.

#### Scenario: Refresh after adding items
- GIVEN the user has added items
- WHEN the browser page is refreshed
- THEN the saved items are restored

### Requirement: Theme Preference

The app SHALL allow users to switch between light and dark mode.

#### Scenario: User toggles dark mode
- GIVEN the app is open
- WHEN the user activates the theme control
- THEN the app changes theme
- AND the selected theme is saved for the next visit
